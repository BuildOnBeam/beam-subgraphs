import { 
    InitiatedValidatorRegistration,
    InitiatedValidatorRemoval,
    CompletedValidatorRegistration,
    CompletedValidatorRemoval,
    CompletedValidatorWeightUpdate,
} from '../generated/ValidatorManager/ValidatorManager'
import { 
    InitiatedDelegatorRegistration,
    InitiatedDelegatorRemoval,
    CompletedDelegatorRegistration,
    CompletedDelegatorRemoval,
    DelegatedNFTs,
    UptimeUpdated
} from '../generated/Native721TokenStakingManager/Native721TokenStakingManager'
import { 
    Validation,
    Delegation,
    UptimeUpdate,
} from '../generated/schema'
import { Bytes, BigInt } from '@graphprotocol/graph-ts'


export function handleInitiatedValidatorRegistration(event: InitiatedValidatorRegistration): void {
    let entity = getOrCreateValidation(event.params.validationID)

    entity.nodeID = event.params.nodeID
    entity.weight = event.params.weight
    entity.status = "PendingAdded"
    entity.save()
}

export function handleCompletedValidatorRegistration(event: CompletedValidatorRegistration): void {
    let entity = getOrCreateValidation(event.params.validationID)

    entity.startedAt = event.block.timestamp.toI64()
    entity.status = "Active"
    entity.save()
}


export function handleInitiatedValidatorRemoval(event: InitiatedValidatorRemoval): void {
    let entity = getOrCreateValidation(event.params.validationID)

    entity.endTime = event.params.endTime.toI64()
    entity.status = "PendingRemoved"
    entity.save()
}

export function handleCompletedValidatorRemoval(event: CompletedValidatorRemoval): void {
    let entity = getOrCreateValidation(event.params.validationID)

    entity.status = "Removed"
    entity.save()
}

export function handleCompletedValidatorWeightUpdate(event: CompletedValidatorWeightUpdate): void {
    let entity = getOrCreateValidation(event.params.validationID)

    entity.weight = event.params.weight
    entity.save() 
}

export function handleInitiatedDelegatorRegistration(event: InitiatedDelegatorRegistration): void {
    let entity = getOrCreateDelegation(event.params.delegationID)

    entity.validationID = event.params.validationID
    entity.owner = event.params.delegatorAddress
    entity.weight = event.params.delegatorWeight
    entity.status = "PendingAdded"
    entity.save()
}

export function handleCompletedDelegatorRegistration(event: CompletedDelegatorRegistration): void {
    let entity = getOrCreateDelegation(event.params.delegationID)

    entity.startedAt = event.params.startTime.toI64()
    entity.status = "Active"
    entity.save()
}

export function handleInitiatedDelegatorRemoval(event: InitiatedDelegatorRemoval): void {
    let entity = getOrCreateDelegation(event.params.delegationID)

    entity.endTime = event.block.timestamp.toI64()
    entity.status = "PendingRemoved"
    entity.save()
}

export function handleCompletedDelegatorRemoval(event: CompletedDelegatorRemoval): void {
    let entity = getOrCreateDelegation(event.params.delegationID)

    entity.status = "Removed"
    entity.save()
}

export function handleDelegatedNFTs(event: DelegatedNFTs): void {
    let entity = getOrCreateDelegation(event.params.delegationID)

    entity.tokenIDs = event.params.tokenIDs
    entity.save()
}

export function handleUptimeUpdated(event: UptimeUpdated): void {
    let entity = UptimeUpdate.load(event.params.validationID.concatI32(event.params.epoch.toI32()))
    if (entity == null) {
        entity = new UptimeUpdate(event.params.validationID.concatI32(event.params.epoch.toI32()))
    }

    entity.validationID = event.params.validationID
    entity.uptimeSeconds = event.params.uptime
    entity.epoch = event.params.epoch
    entity.save()
}

// helper funcfions
function getOrCreateValidation(id: Bytes): Validation {
    let entity = Validation.load(id)
    if (entity == null) {
        entity = new Validation(id)
        entity.nodeID = Bytes.empty()
        entity.weight = BigInt.zero()
        entity.status = "Unknown"
    }
    return entity;
}

function getOrCreateDelegation(id: Bytes): Delegation {
    let entity = Delegation.load(id)
    if (entity == null) {
        entity = new Delegation(id)
        entity.validationID = Bytes.empty()
        entity.owner = Bytes.empty()
        entity.weight = BigInt.zero()
        entity.status = "Unknown"
    }
    return entity;
}
