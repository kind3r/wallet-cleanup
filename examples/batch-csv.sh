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
