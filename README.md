# Solidity Bid Demo
Blockchain bidding demo with a Solidity smart contract using 0.8.xx compiler.
## Description
This allows an owner to create a contract with a reservation, auction time, and minimum bid to allow multiple wallet holders to bid on a physical item.  The item is assumed to be delivered by the owner at the end of the bidding process.  At the end of the auction, funds are delivered to the owner from the highest bidder, and funds are returned to those not winning the bid.  Bidders can withdraw their bids before the auction ends.

To run:

1) Install truffle if not already installed, ie. npm install -g truffle
2) Run "truffle test" in the project root folder to see it in action
