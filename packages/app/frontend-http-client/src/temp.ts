import { ContractDefinition, AvailableService, type AnyRouter, type Headers } from '@lokalise/api-contracts'

function initialiseContractService() {

}

function createServiceMethod<
    Service extends AvailableService,
    Router extends AnyRouter,
    ContractHeaders extends Headers,
>(definition: ContractDefinition<Service, Router, ContractHeaders>) {

}