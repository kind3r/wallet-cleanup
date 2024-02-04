# wallet-cleanup
Solana wallet cleanup tool

## Features
* Closes empty token accounts to recover rent.

## TODO
* Token2022 accounts
* Defi accounts

## Instalation

You can use the binaries provided on the [releases](https://github.com/kind3r/wallet-cleanup/releases/) page or build it locally.

## Building

You need [Node.js](https://nodejs.org/en) 18 or later and git.

1. Clone the repo
2. Install dependencies
3. Compile

```sh
$ git clone https://github.com/kind3r/wallet-cleanup.git
$ cd wallet-cleanup
$ npm install
$ npm run compile
```

This will produce the binaries for Linux x64 (`wallet-cleanup-linux-x64`), Linux arm64 (`wallet-cleanup-linux-arm64`) and MacOs arm64 (`wallet-cleanup-macos-arm64`) in the ./bin folder.

Alternatively you can just run the code without compiling it into a binary:
```sh
$ npm start -- [program options go here]
```

## Usage

```
Options:
  -V, --version                        output the version number
  -r, --rpc <string>                   RPC to use (default: "https://api.mainnet-beta.solana.com", env: WC_RPC)
  -k, --private-key <string>           Wallet private key (file or json or bs58 encoded) (default: "wallet.json", env: WC_PRIVATE_KEY)
  -s --simulate-only                   Don't actually send transactions, just simulate them (default: false, env: WC_SIMULATE)
  -p --parallel-transactions <number>  Number of parallel transactions to send when batching instructions (default: 5, env: WC_PARALLEL_TX)
  -h, --help                           display help for command

```

You can set the runtime options via command line or environment variables. The 2 options you'll use the most are `-r` to set your RPC and `-k` for the private key of the wallet you want to cleanup.

The `-k` private key parameter accepts the following:
- a path to a .json key file (like the one solana cli uses)
- the contents of the .json key file (which is a json array of numbers)
- a bs58 encoded string private key (usually wallet apps export this format)

### Examples using the built binaries (linux x64)
```sh
# Private key stored in wallet.json file

$ ./bin/wallet-cleanup-linux-x64 -r "https://api.mainnet-beta.solana.com" -k ./wallet.json


# Private key as json array

$ ./bin/wallet-cleanup-linux-x64 -r "https://api.mainnet-beta.solana.com" -k "[1,2,3,4,5,6,7...]"


# Private key as a bs58 encoded string

$ ./bin/wallet-cleanup-linux-x64 -r "https://api.mainnet-beta.solana.com" -k w1a52xcStRKCHEEnbd...
```

### Examples using the source code
```sh
# Private key stored in wallet.json file

$ npm start -- -r "https://api.mainnet-beta.solana.com" -k ./wallet.json


# Private key as json array

$ npm start -- -r "https://api.mainnet-beta.solana.com" -k "[1,2,3,4,5,6,7...]"


# Private key as a bs58 encoded string

$ npm start -- -r "https://api.mainnet-beta.solana.com" -k w1a52xcStRKCHEEnbd...
```

### Example with csv file

Using multiple private keys stored in a csv file.

```sh
#!/bin/bash

# Read columns 1 (wallet alias) and 2 (private key) from wallets.csv file
# and run the wallet 

RPC=http://your.rpc.address
INPUT_FILE=wallets.csv
ALIAS_COL=1
PK_COL=2

while IFS="," read -r ALIAS PK
do
  echo "Cleaning up wallet: $ALIAS"
  wallet-cleanup -r "${RPC}" -k $PK
done < <(cut -d "," -f${ALIAS_COL},${PK_COL} ${INPUT_FILE} | tail -n +2)
```
