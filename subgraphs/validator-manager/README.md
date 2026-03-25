# validator-manager-subgraph

Subgraph to be used with the Beam staking contracts, as a data source for the staking frontend.

## Quickstart

- run `nvm use` and `yarn` from the repo root
- make sure your IP is whitelisted for the Graph node's admin API
- run `yarn validator-manager all:beta` and `...all:beta-test` to deploy preview-subgraphs for test- and mainnet (_pos-testnet-beta_ and _pos-beta_)
- run `yarn validator-manager all:test` to deploy production testnet-subgraph _pos-testnet_
- run `yarn validator-manager all` to deploy production mainnet-subgraph _pos_
