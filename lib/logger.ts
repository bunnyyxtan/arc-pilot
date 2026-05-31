export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

type LogContext = Record<string, unknown>;

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  DEBUG: 10,
  INFO: 20,
  WARN: 30,
  ERROR: 40
};

const SECRET_KEY_PATTERN = /(private.?key|api.?key|authorization|auth.?header|bearer|secret|password|token|mnemonic|seed|rawenv|\.env)/i;
const LARGE_TEXT_KEY_PATTERN = /(prompt|messages|generatedcontent|content|payload|body)/i;
const ADDRESS_KEY_PATTERN = /(address|wallet|client|owner|recipient|openedby|evaluator|deployer)/i;

function configuredLevel(): LogLevel {
  const raw = typeof process !== "undefined" ? process.env?.ARCPILOT_LOG_LEVEL : undefined;
  if (raw === "DEBUG" || raw === "INFO" || raw === "WARN" || raw === "ERROR") {
    return raw;
  }
  return "INFO";
}

function shouldLog(level: LogLevel) {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[configuredLevel()];
}

function shortenHex(value: string) {
  if (!/^0x[a-fA-F0-9]{40,64}$/.test(value)) {
    return value;
  }
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function sanitizeValue(value: unknown, key = "", depth = 0): unknown {
  if (SECRET_KEY_PATTERN.test(key)) {
    return "[REDACTED]";
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack
    };
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (typeof value === "string") {
    if (ADDRESS_KEY_PATTERN.test(key)) {
      return shortenHex(value);
    }
    if (LARGE_TEXT_KEY_PATTERN.test(key) && value.length > 180) {
      return `${value.slice(0, 180)}...`;
    }
    return value.length > 500 ? `${value.slice(0, 500)}...` : value;
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  if (depth > 4) {
    return "[MaxDepth]";
  }

  if (Array.isArray(value)) {
    return value.slice(0, 25).map((item) => sanitizeValue(item, key, depth + 1));
  }

  const result: LogContext = {};
  for (const [entryKey, entryValue] of Object.entries(value as LogContext)) {
    result[entryKey] = sanitizeValue(entryValue, entryKey, depth + 1);
  }
  return result;
}

function emit(level: LogLevel, module: string, action: string, message: string, context: LogContext = {}) {
  if (!shouldLog(level)) {
    return;
  }

  const error = context.error instanceof Error ? context.error : undefined;
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    module,
    action,
    message,
    context: sanitizeValue(context),
    ...(error
      ? {
          errorMessage: error.message,
          stack: error.stack
        }
      : {})
  };

  const line = JSON.stringify(entry);
  if (level === "ERROR") {
    console.error(line);
  } else if (level === "WARN") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  debug(module: string, action: string, context?: LogContext, message = "debug") {
    emit("DEBUG", module, action, message, context);
  },
  info(module: string, action: string, context?: LogContext, message = "info") {
    emit("INFO", module, action, message, context);
  },
  warn(module: string, action: string, context?: LogContext, message = "warning") {
    emit("WARN", module, action, message, context);
  },
  error(module: string, action: string, context?: LogContext, message = "error") {
    emit("ERROR", module, action, message, context);
  }
};

export async function loggedOperation<T>(
  module: string,
  action: string,
  context: LogContext,
  operation: () => Promise<T>
): Promise<T> {
  logger.info(module, `${action}:start`, context, "operation started");
  try {
    const result = await operation();
    logger.info(module, `${action}:success`, context, "operation completed");
    return result;
  } catch (error) {
    logger.error(module, `${action}:failed`, { ...context, error }, "operation failed");
    throw error;
  }
}
