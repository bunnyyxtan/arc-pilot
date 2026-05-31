// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AgentRegistry} from "./AgentRegistry.sol";

contract TrustBondVault is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;
    AgentRegistry public immutable agentRegistry;
    uint256 public withdrawalCooldown = 24 hours;
    mapping(uint256 => uint256) public bondBalance;
    mapping(address => bool) public authorizedOperators;

    struct PendingWithdrawal {
        uint256 amount;
        uint64 availableAt;
    }

    mapping(uint256 => PendingWithdrawal) public pendingWithdrawals;

    event BondDeposited(uint256 indexed agentId, address indexed owner, uint256 amount);
    event WithdrawRequested(uint256 indexed agentId, uint256 amount, uint64 availableAt);
    event WithdrawCanceled(uint256 indexed agentId);
    event BondWithdrawn(uint256 indexed agentId, address indexed recipient, uint256 amount);
    event BondSlashed(uint256 indexed agentId, address indexed recipient, uint256 amount);
    event BondCreditedFromEscrow(uint256 indexed agentId, uint256 amount);
    event AuthorizedOperatorSet(address indexed operator, bool allowed);

    modifier onlyAgentOwner(uint256 agentId) {
        require(agentRegistry.ownerOfAgent(agentId) == msg.sender, "TrustBondVault: not agent owner");
        _;
    }

    modifier onlyAuthorizedOperator() {
        require(authorizedOperators[msg.sender], "TrustBondVault: not authorized");
        _;
    }

    constructor(address usdc_, address agentRegistry_) Ownable(msg.sender) {
        require(usdc_ != address(0), "TrustBondVault: zero usdc");
        require(agentRegistry_ != address(0), "TrustBondVault: zero registry");
        usdc = IERC20(usdc_);
        agentRegistry = AgentRegistry(agentRegistry_);
    }

    function depositBond(uint256 agentId, uint256 amount) external nonReentrant onlyAgentOwner(agentId) {
        require(amount > 0, "TrustBondVault: zero amount");
        bondBalance[agentId] += amount;
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        emit BondDeposited(agentId, msg.sender, amount);
    }

    function requestWithdraw(uint256 agentId, uint256 amount) external onlyAgentOwner(agentId) {
        require(amount > 0, "TrustBondVault: zero amount");
        require(amount <= _availableBond(agentId), "TrustBondVault: insufficient available bond");

        uint64 availableAt = uint64(block.timestamp + withdrawalCooldown);
        pendingWithdrawals[agentId] = PendingWithdrawal({amount: amount, availableAt: availableAt});
        emit WithdrawRequested(agentId, amount, availableAt);
    }

    function executeWithdraw(uint256 agentId) external nonReentrant onlyAgentOwner(agentId) {
        PendingWithdrawal memory pending = pendingWithdrawals[agentId];
        require(pending.amount > 0, "TrustBondVault: no pending withdrawal");
        require(block.timestamp >= pending.availableAt, "TrustBondVault: cooldown active");
        require(pending.amount <= bondBalance[agentId], "TrustBondVault: insufficient bond");

        delete pendingWithdrawals[agentId];
        bondBalance[agentId] -= pending.amount;
        usdc.safeTransfer(msg.sender, pending.amount);
        emit BondWithdrawn(agentId, msg.sender, pending.amount);
    }

    function cancelWithdraw(uint256 agentId) external onlyAgentOwner(agentId) {
        require(pendingWithdrawals[agentId].amount > 0, "TrustBondVault: no pending withdrawal");
        delete pendingWithdrawals[agentId];
        emit WithdrawCanceled(agentId);
    }

    function slashBond(uint256 agentId, uint256 amount, address recipient) external nonReentrant onlyAuthorizedOperator {
        require(amount > 0, "TrustBondVault: zero amount");
        require(recipient != address(0), "TrustBondVault: zero recipient");
        require(amount <= bondBalance[agentId], "TrustBondVault: insufficient bond");

        bondBalance[agentId] -= amount;
        _trimPendingWithdrawal(agentId);
        usdc.safeTransfer(recipient, amount);
        emit BondSlashed(agentId, recipient, amount);
    }

    function creditBondFromEscrow(uint256 agentId, uint256 amount) external nonReentrant onlyAuthorizedOperator {
        require(amount > 0, "TrustBondVault: zero amount");
        bondBalance[agentId] += amount;
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        emit BondCreditedFromEscrow(agentId, amount);
    }

    function bondOf(uint256 agentId) external view returns (uint256) {
        return bondBalance[agentId];
    }

    function setAuthorizedOperator(address operator, bool allowed) external onlyOwner {
        require(operator != address(0), "TrustBondVault: zero operator");
        authorizedOperators[operator] = allowed;
        emit AuthorizedOperatorSet(operator, allowed);
    }

    function _availableBond(uint256 agentId) private view returns (uint256) {
        uint256 pending = pendingWithdrawals[agentId].amount;
        return bondBalance[agentId] > pending ? bondBalance[agentId] - pending : 0;
    }

    function _trimPendingWithdrawal(uint256 agentId) private {
        PendingWithdrawal storage pending = pendingWithdrawals[agentId];
        if (pending.amount > bondBalance[agentId]) {
            pending.amount = bondBalance[agentId];
            if (pending.amount == 0) {
                delete pendingWithdrawals[agentId];
            }
        }
    }
}
