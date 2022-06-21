let BidContractTest = artifacts.require('./TestBidContract');
const BigNumber = require('bignumber.js')

contract('BidContractTest', function(accounts) {
    let contract;
    let owner = accounts[0];
    let bidder1 = accounts[1];
    let bidder2 = accounts[2];
    let bidder3 = accounts[3];

    const ONE_ETH = new BigNumber(1000000000000000000);
    const STARTED_STATE = 0;
    const FAILED_STATE = 1;
    const SUCCEEDED_STATE = 2;
    const FINISHED_STATE = 3;
    const RESERVATION_AMOUNT_IN_WEI = 1000000;
    const MIN_BID_IN_WEI = 1;

    const BIDDING_TIME_MIN = 3;
    const BID_ITEM_DESCRIPTION = 'Ferrari Testarossa';
    const BIDDING_OVER_ERROR_MSG = "Bidding deadline over";
    const BIDDER_IS_OWNER_ERROR_MSG = "Bidder is the owner.";
    const BIDDING_NOT_OVER_ERROR_MSG = "Cannot finish auction before the deadline";
    const NO_BIDDER_ERROR_MSG = "No one has bidded or all bids removed.";

    beforeEach(async function() {
        contract = await BidContractTest.new(BID_ITEM_DESCRIPTION ,MIN_BID_IN_WEI, RESERVATION_AMOUNT_IN_WEI, BIDDING_TIME_MIN, {from: owner, gas: 4000000});
    });

    it('contract is initialized', async function() {
        let bidItem = await contract.getBidItem();
        expect(bidItem).to.equal(BID_ITEM_DESCRIPTION);
        let minBidInWei = await contract.getMinBidInWei({from: owner});
        expect(minBidInWei.toNumber()).to.equal(MIN_BID_IN_WEI);
        let state = await contract.state.call()
        expect(state.valueOf().toNumber()).to.equal(STARTED_STATE);
        let biddingDeadline = await contract.biddingDeadlineInMin.call();
        expect(biddingDeadline.toNumber()).to.equal(3);
        let reservationAmount = await contract.getReservationAmountInWei({from: owner});
        expect(reservationAmount.toNumber()).to.equal(RESERVATION_AMOUNT_IN_WEI);
    });
    it('each can bid and change bid', async function() {
        // Test owner can't bid
        try {
            await contract.addOrModifyBid({
                value: 1,
                from: owner
            });
            expect.fail();
        } catch(error) {
            expect(error.message).to.contain(BIDDER_IS_OWNER_ERROR_MSG);
        }
        // Test others can bid
        try {
            const gasPrice = await web3.eth.getGasPrice();
            console.log("Gas price: " + gasPrice);
            const bid1 = 30000000;
            const bid2 = 10000000;
            const bid3 = 20000000;
            console.log("Bidding");
            await contract.addOrModifyBid({
                value: bid2,
                from: bidder2
            });
            await contract.addOrModifyBid({
                value: bid3,
                from: bidder3
            });
            await contract.addOrModifyBid({
                value: bid1,
                from: bidder1
            });
            let numberOfBids = await contract.getNumberOfBids();
            expect(numberOfBids.toNumber()).to.equal(3);
            let highestBid = await contract.getHighestBid();
            expect(highestBid.toNumber()).to.equal(bid1);
            let highestBidder = await contract.getHighestBidder({from: owner});
            expect(highestBidder).to.equal(bidder1);

            // Remove bid from highest bidder, check highest bidder again
            console.log("Withdrawing bid from highest bidder");
            let bidder1BalanceBefore = await web3.eth.getBalance(bidder1);
            let tnx = await contract.withdrawBid({from: bidder1});
            console.log("Tnx: " + JSON.stringify(tnx));
            // const events = tnx.logs
            // for( i = 0; i < events.length; i++) {
            //     const event = events[i];
            //     console.log(event.args.addr + " " + event.args.log);
            // }

            numberOfBids = await contract.getNumberOfBids();
            console.log("Number of bids now " + numberOfBids.toNumber());
            expect(numberOfBids.toNumber()).to.equal(2);
            highestBid = await contract.getHighestBid();
            expect(highestBid.toNumber()).to.equal(bid3);
            highestBidder = await contract.getHighestBidder({from: owner});
            console.log("Highest bidder now " + highestBidder);
            expect(highestBidder).to.equal(bidder3);
            let bidder1BalanceAfter = await web3.eth.getBalance(bidder1);
            console.log("Before/After bidder 1 " + bidder1BalanceBefore + " " + bidder1BalanceAfter);
            tnx = await contract.withdrawBid({from: bidder3});

            numberOfBids = await contract.getNumberOfBids();
            console.log("Number of bids now " + numberOfBids.toNumber());
            expect(numberOfBids.toNumber()).to.equal(1);
            highestBid = await contract.getHighestBid();
            expect(highestBid.toNumber()).to.equal(bid2);
            highestBidder = await contract.getHighestBidder({from: owner});
            console.log("Highest bidder now " + highestBidder);
            expect(highestBidder).to.equal(bidder2);

            // Remove last bidder, check highest bidder again
            tnx = await contract.withdrawBid({from: bidder2});
            try {
                tnx = await contract.withdrawBid({from: bidder2});
                expect.fail();
            } catch (error) {
                expect(error.message).to.contain(NO_BIDDER_ERROR_MSG);
            }


        } catch (error) {
            expect.fail(error);
        }
    });

    it('cannot bid after deadline', async function() {
        try {
            await contract.setCurrentTime(4);
            await contract.addOrModifyBid({
                value: 1,
                from: bidder2
            });
            expect.fail();
        } catch (error) {
            expect(error.message).to.contain(BIDDING_OVER_ERROR_MSG);
        }
    });
    it('Finish Auction Bidding Failed', async function() {
        let bid = web3.utils.toWei(web3.utils.toBN(2),'wei');
        await contract.addOrModifyBid({
            value: bid,
            from: bidder3
        });
        // Test ending before time is up
        try {
            console.log("Finish Auction Bidding Failed: testing finishing auction early.");
            await contract.finishAuction({from: owner});
            expect.fail();
        } catch (error) {
            expect(error.message).to.contain(BIDDING_NOT_OVER_ERROR_MSG);
        }
        let reservation = await contract.getReservationAmountInWei();
        let highestBid = await contract.getHighestBid();
        console.log("Reservation: " + reservation.toNumber() + " bid: " + bid + " highestBid: " + highestBid.toString());
        await contract.setCurrentTime(BIDDING_TIME_MIN+1);
        await contract.finishAuction({from: owner});
        let state = await contract.state.call();
        expect(state.valueOf().toNumber()).to.equal(FAILED_STATE);
    });

    it('Finish Auction Bidding Succeeded', async function() {
        let bid = web3.utils.toWei(web3.utils.toBN(1000000),'wei');
        await contract.addOrModifyBid({
            value: bid,
            from: bidder3
        });
        
        let reservation = await contract.getReservationAmountInWei();
        let highestBid = await contract.getHighestBid();
        console.log("Reservation: " + reservation.toNumber() + " bid: " + bid + " highestBid: " + highestBid.toString());
        await contract.setCurrentTime(BIDDING_TIME_MIN+1);
        await contract.finishAuction({from: owner});
        let state = await contract.state.call();
        expect(state.valueOf().toNumber()).to.equal(SUCCEEDED_STATE);
    });

    it('Award Winning Bid', async function() {
        let ownerBalanceBefore = await web3.eth.getBalance(owner);
         // Test calling it in the wrong state
         try {
            console.log("Award Winning Bid: testing finishing auction early.");
            await contract.awardWinningBid({from: owner});
            expect.fail();
        } catch (error) {
        }
        let bid3 = web3.utils.toWei(web3.utils.toBN(1000000),'wei');
        let bid1 = web3.utils.toWei(web3.utils.toBN(1000001),'wei');
        await contract.addOrModifyBid({
            value: bid3,
            from: bidder3
        });
        await contract.addOrModifyBid({
            value: bid1,
            from: bidder1
        });
        
        await contract.setCurrentTime(BIDDING_TIME_MIN+1);
        await contract.finishAuction({from: owner});
        let state = await contract.state.call();
        expect(state.valueOf().toNumber()).to.equal(SUCCEEDED_STATE);
        let tnx = await contract.awardWinningBid({from: owner});
        let ownerBalanceAfter = await web3.eth.getBalance(owner);
        console.log("Owner balance before/after: " + ownerBalanceBefore + " " + ownerBalanceAfter);

        const events = tnx.logs
        expect(events.length).to.equal(1);
        const event = events[0]
        expect(event.args.bidItem).to.equal(BID_ITEM_DESCRIPTION);
        expect(event.args.addr).to.equal(owner);

    });
    it('Return Funcs from Failed Bid', async function() {
        let bid3 = web3.utils.toWei(web3.utils.toBN(100000),'wei');
        let bid1 = web3.utils.toWei(web3.utils.toBN(100001),'wei');
        await contract.addOrModifyBid({
            value: bid3,
            from: bidder3
        });
        await contract.addOrModifyBid({
            value: bid1,
            from: bidder1
        });
        await contract.setCurrentTime(BIDDING_TIME_MIN+1);
        await contract.finishAuction({from: owner});
        let state = await contract.state.call();
        expect(state.valueOf().toNumber()).to.equal(FAILED_STATE);
        let tnx = await contract.returnFundsForFailedAuction({from: owner});

        const events = tnx.logs
        expect(events.length).to.equal(0);    
    });    
});