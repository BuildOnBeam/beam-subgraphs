// subgraphs/validator-manager/src/mapping.ts

import {
  InitiatedValidatorRegistration,
  InitiatedValidatorRemoval,
  CompletedValidatorRegistration,
  CompletedValidatorRemoval,
  CompletedValidatorWeightUpdate,
  RegisteredInitialValidator,
} from "../generated/ValidatorManager/ValidatorManager";
import {
  InitiatedDelegatorRegistration,
  InitiatedDelegatorRemoval,
  CompletedDelegatorRegistration,
  CompletedDelegatorRemoval,
  DelegatedNFTs,
  UptimeUpdated,
  RewardClaimed,
  RewardRegistered,
  RewardCancelled,
  RewardResolved,
  UnlockedDelegation,
  UnlockedValidation,
} from "../generated/Native721TokenStakingManager/Native721TokenStakingManager";
import {
  Validation,
  Delegation,
  UptimeUpdate,
  RegisteredReward,
  ClaimedReward,
} from "../generated/schema";
import { Bytes, BigInt, Address, ethereum } from "@graphprotocol/graph-ts";

// ----------------------
// Validator lifecycle
// ----------------------

export function handleInitiatedValidatorRegistration(
  event: InitiatedValidatorRegistration
): void {
  let entity = getOrCreateValidation(event.params.validationID);

  entity.nodeID = event.params.nodeID;
  entity.owner = event.transaction.from;
  entity.weight = event.params.weight; // BEAM at registration
  entity.initialWeight = event.params.weight; // snapshot of self BEAM at registration
  entity.status = "PendingAdded";
  entity.initiateRegistrationTx = event.transaction.hash;

  // === NFT logic (unchanged) ===
  for (let i = 0; i < event.receipt!.logs.length; i++) {
    const eventLog = event.receipt!.logs[i];
    if (
      eventLog.topics[0].toHexString() ==
      "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
    ) {
      let tokenIDs = entity.tokenIDs!;
      tokenIDs.push(ethereum.decode("uint256", eventLog.topics[3])!.toBigInt());
      entity.tokenIDs = tokenIDs;
    }
  }
  entity.totalTokens = BigInt.fromI32(entity.tokenIDs!.length);
  // === /NFT logic ===

  // Decode initiateValidatorRegistration args (no fake offset)
  const paramsHex = event.transaction.input.toHexString().slice(10); // strip selector
  const paramsBytes = Bytes.fromHexString(paramsHex);
  const decoded = ethereum.decode(
    "(bytes,bytes,uint64,(uint32,address[]),(uint32,address[]),uint16,uint64,uint256[])",
    paramsBytes
  );

  entity.delegationFeeBips = decoded
    ? decoded.toTuple()[5].toBigInt()
    : BigInt.fromI32(10000);

  entity.minStakeDuration = decoded
    ? decoded.toTuple()[6].toBigInt()
    : BigInt.zero();

  entity.save();
}

export function handleCompletedValidatorRegistration(
  event: CompletedValidatorRegistration
): void {
  let entity = getOrCreateValidation(event.params.validationID);

  entity.startedAt = event.block.timestamp.toI64();
  entity.status = "Active";
  entity.completeRegistrationTx = event.transaction.hash;
  entity.save();
}

export function handleRegisteredInitialValidator(
  event: RegisteredInitialValidator
): void {
  let entity = getOrCreateValidation(event.params.validationID);

  entity.nodeID = event.params.nodeID;
  entity.owner = Address.zero();
  entity.weight = event.params.weight;
  entity.initialWeight = event.params.weight;
  entity.startedAt = event.block.timestamp.toI64();
  entity.status = "Active";
  entity.save();
}

export function handleInitiatedValidatorRemoval(
  event: InitiatedValidatorRemoval
): void {
  let entity = getOrCreateValidation(event.params.validationID);

  entity.endTime = event.params.endTime.toI64();
  entity.status = "PendingRemoved";
  entity.initiateRemovalTx = event.transaction.hash;
  entity.save();
}

export function handleCompletedValidatorRemoval(
  event: CompletedValidatorRemoval
): void {
  let entity = getOrCreateValidation(event.params.validationID);

  // No BEAM reductions here; we reduce only when unlock completes.
  entity.status = "Removed";
  entity.completeRemovalTx = event.transaction.hash;
  entity.save();
}

export function handleCompletedValidatorWeightUpdate(
  event: CompletedValidatorWeightUpdate
): void {
  let entity = getOrCreateValidation(event.params.validationID);

  // Apply only increases now; defer decreases until unlock/claim.
  if (event.params.weight.gt(entity.weight)) {
    entity.weight = event.params.weight;
    entity.save();
  }
  // If event.params.weight < entity.weight, ignore here; subtract later at unlock.
}

// ----------------------
// Delegation lifecycle
// ----------------------

export function handleInitiatedDelegatorRegistration(
  event: InitiatedDelegatorRegistration
): void {
  let entity = getOrCreateDelegation(event.params.delegationID);
  let validation = getOrCreateValidation(event.params.validationID);

  entity.validationID = validation.id;
  entity.validationNodeID = validation.nodeID;
  entity.owner = event.params.delegatorAddress;
  entity.weight = event.params.delegatorWeight; // BEAM delegation weight (if BEAM)
  entity.status = "PendingAdded";
  entity.initiateRegistrationTx = event.transaction.hash;
  entity.save();
}

export function handleCompletedDelegatorRegistration(
  event: CompletedDelegatorRegistration
): void {
  let entity = getOrCreateDelegation(event.params.delegationID);

  entity.startedAt = event.params.startTime.toI64();
  entity.status = "Active";
  entity.completeRegistrationTx = event.transaction.hash;
  entity.save();
}

export function handleInitiatedDelegatorRemoval(
  event: InitiatedDelegatorRemoval
): void {
  let entity = getOrCreateDelegation(event.params.delegationID);

  entity.endTime = event.block.timestamp.toI64();
  entity.status = "PendingRemoved";
  entity.initiateRemovalTx = event.transaction.hash;

  // === NFT logic (unchanged) ===
  if (entity.tokenIDs != null) {
    entity.status = "Removed";
  }
  // === /NFT logic ===

  entity.save();
}

export function handleCompletedDelegatorRemoval(
  event: CompletedDelegatorRemoval
): void {
  let entity = getOrCreateDelegation(event.params.delegationID);

  entity.status = "Removed";
  entity.completeRemovalTx = event.transaction.hash;

  // === NFT logic (unchanged) ===
  if (entity.tokenIDs != null) {
    let validation = getOrCreateValidation(entity.validationID);
    validation.totalTokens = validation.totalTokens.minus(
      BigInt.fromI32(entity.tokenIDs!.length)
    );
    validation.save();

    entity.unlocked = true;
  }
  // === /NFT logic ===

  entity.save();
}

export function handleDelegatedNFTs(event: DelegatedNFTs): void {
  let entity = getOrCreateDelegation(event.params.delegationID);

  entity.tokenIDs = event.params.tokenIDs;
  entity.save();

  // === NFT logic (unchanged) ===
  let validation = getOrCreateValidation(entity.validationID);
  validation.totalTokens = validation.totalTokens.plus(
    BigInt.fromI32(event.params.tokenIDs.length)
  );
  validation.save();
  // === /NFT logic ===
}

// ----------------------
// Uptime & rewards
// ----------------------

export function handleUptimeUpdated(event: UptimeUpdated): void {
  let entity = UptimeUpdate.load(
    event.params.validationID.concatI32(event.params.epoch.toI32())
  );
  if (entity == null) {
    entity = new UptimeUpdate(
      event.params.validationID.concatI32(event.params.epoch.toI32())
    );
  }

  entity.validationID = event.params.validationID;
  entity.uptimeSeconds = event.params.uptime;
  entity.epoch = event.params.epoch;
  entity.save();
}

export function handleRewardResolved(event: RewardResolved): void {
  let entity = getOrCreateDelegation(event.params.delegationID);
  entity.lastRewardedEpoch = event.params.epoch;
  entity.save();
}

// ----------------------
// Unlocks (21-day complete + claimed)
// ----------------------

export function handleUnlockedDelegation(event: UnlockedDelegation): void {
  let delegation = getOrCreateDelegation(event.params.delegationID);
  let validation = getOrCreateValidation(delegation.validationID);

  delegation.unlocked = true;

  // Only change BEAM weight here; keep ALL NFT behavior as-is elsewhere.
  const isNFTDelegation =
    delegation.tokenIDs != null && delegation.tokenIDs!.length > 0;

  if (!isNFTDelegation) {
    // BEAM claim → reduce validator.weight by EXACT delegation.weight
    validation.weight = validation.weight.minus(delegation.weight);
    validation.save();
  }

  delegation.save();
}

export function handleUnlockedValidation(event: UnlockedValidation): void {
  let validation = getOrCreateValidation(event.params.validationID);

  validation.unlocked = true;

  // Only change BEAM weight here; DO NOT touch NFTs (keep original behavior).
  // Reduce validator.weight by EXACT self-stake recorded at registration.
  validation.weight = validation.weight.minus(validation.initialWeight);

  validation.save();
}

// ----------------------
// Reward claims snapshot
// ----------------------

export function handleRewardClaimed(event: RewardClaimed): void {
  let entity = getOrCreateClaimedReward(
    event.params.account.concatI32(event.block.timestamp.toI32())
  );

  entity.epoch = event.params.epoch;
  entity.primary = event.params.primary;
  entity.account = event.params.account;
  entity.timestamp = event.block.timestamp;

  var present = false;
  for (var i = 0; i < entity.tokens!.length; i++) {
    if (entity.tokens![i] == event.params.token) {
      entity.amounts![i] = entity.amounts![i].plus(event.params.amount);
      present = true;
      break;
    }
  }

  if (!present) {
    let tokens = entity.tokens!;
    tokens.push(event.params.token);
    entity.tokens = tokens;

    let amounts = entity.amounts!;
    amounts.push(event.params.amount);
    entity.amounts = amounts;
  }

  entity.save();
}

export function handleRewardRegistered(event: RewardRegistered): void {
  let entity = getOrCreateRegisteredReward(
    Bytes.empty()
      .concatI32(event.params.epoch.toI32())
      .concatI32(event.params.primary ? 1 : 0)
  );

  entity.epoch = event.params.epoch;
  entity.primary = event.params.primary;

  let tokens = entity.tokens!;
  tokens.push(event.params.token);
  entity.tokens = tokens;

  let amounts = entity.amounts!;
  amounts.push(event.params.amount);
  entity.amounts = amounts;

  let timestamps = entity.timestamps!;
  timestamps.push(event.block.timestamp);
  entity.timestamps = timestamps;

  entity.save();
}

export function handleRewardCancelled(event: RewardCancelled): void {
  let entity = getOrCreateRegisteredReward(
    Bytes.empty()
      .concatI32(event.params.epoch.toI32())
      .concatI32(event.params.primary ? 1 : 0)
  );

  entity.epoch = event.params.epoch;
  entity.primary = event.params.primary;

  for (var i = 0; i < entity.tokens!.length; i++) {
    if (entity.tokens![i] == event.params.token) {
      entity.amounts![i] = BigInt.zero();
    }
  }

  entity.save();
}

// ----------------------
// helpers
// ----------------------

function getOrCreateValidation(id: Bytes): Validation {
  let entity = Validation.load(id);
  if (entity == null) {
    entity = new Validation(id);
    entity.nodeID = Bytes.empty();
    entity.weight = BigInt.zero();
    entity.status = "Unknown";
    entity.tokenIDs = [];
    entity.totalTokens = BigInt.zero();
    entity.delegationFeeBips = BigInt.zero();
    entity.minStakeDuration = BigInt.zero();
    entity.unlocked = false;
    entity.initialWeight = BigInt.zero();
  }
  return entity;
}

function getOrCreateDelegation(id: Bytes): Delegation {
  let entity = Delegation.load(id);
  if (entity == null) {
    entity = new Delegation(id);
    entity.validationID = Bytes.empty();
    entity.validationNodeID = Bytes.empty();
    entity.owner = Bytes.empty();
    entity.weight = BigInt.zero();
    entity.status = "Unknown";
    entity.unlocked = false;
    entity.lastRewardedEpoch = BigInt.zero();
    // Note: keep tokenIDs uninitialized as in original (nullable) behavior
  }
  return entity;
}

function getOrCreateClaimedReward(id: Bytes): ClaimedReward {
  let entity = ClaimedReward.load(id);
  if (entity == null) {
    entity = new ClaimedReward(id);
    entity.epoch = BigInt.zero();
    entity.primary = true;
    entity.account = Bytes.empty();
    entity.tokens = [];
    entity.amounts = [];
  }
  return entity;
}

function getOrCreateRegisteredReward(id: Bytes): RegisteredReward {
  let entity = RegisteredReward.load(id);
  if (entity == null) {
    entity = new RegisteredReward(id);
    entity.epoch = BigInt.zero();
    entity.primary = true;
    entity.tokens = [];
    entity.amounts = [];
    entity.timestamps = [];
  }
  return entity;
}
