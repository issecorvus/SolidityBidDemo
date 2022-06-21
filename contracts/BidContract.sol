// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.0 <0.9.0;
import "./Utils.sol";

contract BidContract {
    using Utils for *;

    enum State { Started, Failed, Succeeded, Finished }

    struct Bidder {
        uint timesBid;
        uint bidInWei;
    }
    struct HighestBidder {
        address bidderAddress;
        uint bidInWei;
    }
    event BiddingOver(
        address addr,
        uint highestBid,
        bool succeeded
    );
    event FundsNotTransferred(
        address payable addr,
        uint bidInWei
    );
    event FundsTransferred(
        address payable addr,
        string bidItem
    );
    event LogEvent(
        address payable addr,
        string log
    );
    address owner;
    string bidItem;
    uint minBidInWei;
    uint reservationInWei;
    mapping (address => Bidder) private bidMap;
    mapping (uint => address) private bidToAddressMap;
    HighestBidder highestBidder;
    State public state;
    uint public biddingDeadlineInMin;
    uint public numberOfBids;

    uint constant MAX_RESERVATION_IN_WEI = 100000 * 1 ether; 
    uint constant MAX_BID_IN_WEI = 1000000 * 1 ether;


    constructor(string memory _bidItem, uint _minBidInWei, uint _reservationInWei, uint durationInMin) {
        bidItem = _bidItem;
        owner = msg.sender;
        state = State.Started;
        biddingDeadlineInMin = durationInMin;
        minBidInWei = _minBidInWei;
        require(_reservationInWei < MAX_RESERVATION_IN_WEI, 
            string.concat("Reservation passed exceeds ", Utils.uintToString(MAX_RESERVATION_IN_WEI)));
        reservationInWei = _reservationInWei;
    }
    modifier inState(State expectedState) {
        require(state == expectedState, "Invalid state");
        _;
    }
    modifier isOwner() {
        require(msg.sender == owner);
        _;
    }
    function addOrModifyBid() public payable inState(State.Started) {
        require(msg.sender != owner, "Bidder is the owner.");
        require(beforeBidDeadline(), "Bidding deadline over");
        require(msg.value <= MAX_BID_IN_WEI, 
            string.concat("Bid of ", 
                string.concat(Utils.uintToString(msg.value), 
                    string.concat(" exceeds maximum wei bid of ", Utils.uintToString(MAX_BID_IN_WEI)))));
        require(msg.value > 0, "Bid must be > 0");
        uint bidInWei = msg.value;
        
        if(numberOfBids == 0 || bidInWei > highestBidder.bidInWei) {
            highestBidder = HighestBidder(msg.sender,bidInWei);
        }
        if(bidMap[msg.sender].timesBid == 0) {
            Bidder memory bidder = Bidder(1,bidInWei);
            bidMap[msg.sender] = bidder;
        } else {
            Bidder memory bidder = bidMap[msg.sender];
            bidder.timesBid++;
            bidder.bidInWei = bidInWei;
        }
        bidToAddressMap[numberOfBids++] = msg.sender;
    }

    /* 
        Penalizes some gas for this, especially if you are 
        the highest bidder.
     */
    function withdrawBid() public payable inState(State.Started) {
        require(numberOfBids > 0, "No one has bidded or all bids removed.");
        uint bidInWei = bidMap[msg.sender].bidInWei;
        if(msg.sender == highestBidder.bidderAddress) {
            findNewHighestBidder();
        }
        // Zero the pending refund before sending to prevent re-entrancy attacks
        bidMap[msg.sender].bidInWei = 0;
        (bool sent,) = msg.sender.call{value: bidInWei}("");
        if(!sent) {
            emit LogEvent(payable(msg.sender), string.concat("Failed to send while withdrawing bid: ", Utils.uintToString(bidInWei)));
            bidMap[msg.sender].bidInWei = bidInWei;
        } else {
            numberOfBids--;
        }
    }
    function findNewHighestBidder() internal {
        Bidder memory bestBidder;
        address bestBidderAddr;
        address highestCurrentlyAddr = highestBidder.bidderAddress;
        for( uint8 i = 0; i < numberOfBids; i++) {
            address addr = bidToAddressMap[i];
            Bidder memory bidder =  bidMap[addr];
            if(addr == highestCurrentlyAddr) {
                bidder.bidInWei = 0;
            }
            if(bidder.bidInWei > bestBidder.bidInWei) {
                bestBidder = bidder;
                bestBidderAddr = addr;
            }
        }
        highestBidder.bidderAddress = bestBidderAddr;
        highestBidder.bidInWei = bestBidder.bidInWei;
    }
    function finishAuction() public inState(State.Started) isOwner {
        require(!beforeBidDeadline(), "Cannot finish auction before the deadline");
        bool bidEqualOrOverReservation = false;
        emit LogEvent(payable(msg.sender), string.concat("Hishest bid: ",
            string.concat(Utils.uintToString(highestBidder.bidInWei), 
                string.concat(" res: ", Utils.uintToString(reservationInWei)))) );
        if(highestBidder.bidInWei >= reservationInWei) {
            state = State.Succeeded;
            bidEqualOrOverReservation = true;
        } else {
            state = State.Failed;
        }
        emit BiddingOver(highestBidder.bidderAddress,highestBidder.bidInWei, bidEqualOrOverReservation);
    }
    function awardWinningBid() public inState(State.Succeeded) isOwner {
        address payable ownerAddress = payable(owner);
        uint256 bidInWei = highestBidder.bidInWei;
        highestBidder.bidInWei = 0;
        (bool sent,) = ownerAddress.call{value: bidInWei}("");
        if (!sent) {
            emit FundsNotTransferred(ownerAddress, bidInWei);
            highestBidder.bidInWei = bidInWei;
        } else {
            emit FundsTransferred(ownerAddress, bidItem);
            state = State.Finished;
        }
    }

    function returnFundsForFailedAuction() public inState(State.Failed) isOwner {
        for( uint8 i = 0; i < numberOfBids; i++) {
            address addr = bidToAddressMap[i];
            address payable recipient = payable(addr);
            Bidder memory bidder =  bidMap[recipient];
            uint256 bidInWei = bidder.bidInWei;
            bidder.bidInWei = 0;
            (bool sent,) = recipient.call{value: bidInWei}("");
            if (!sent) {
                emit FundsNotTransferred(recipient,bidInWei);
                bidder.bidInWei = bidInWei;
                state = State.Failed;
                break;
            } else {
                state = State.Finished;
            }
        }
    }

    function beforeBidDeadline() public view returns(bool) {
        return currentTime() < biddingDeadlineInMin;
    }

    function currentTime() internal virtual view returns(uint) {
        return block.timestamp;
    }
    function getBidItem() public view returns(string memory) {
        return bidItem;
    }
    function getMinBidInWei() public view isOwner returns(uint)  {
        return minBidInWei;
    }
    function getReservationAmountInWei() public view isOwner() returns(uint) {
        return reservationInWei;
    }
    function getNumberOfBids() public view returns(uint) {
        return numberOfBids;
    }
    function getHighestBid() public view returns(uint) {
        return highestBidder.bidInWei;
    }
    function getHighestBidder() public view isOwner() returns(address) {
        return highestBidder.bidderAddress;
    }
    function inProgress() public view returns (bool) {
        return state == State.Started;
    }

    function isSuccessfulAuction() public view returns (bool) {
        return state == State.Finished || state == State.Succeeded;
    }

    fallback() external payable {
        emit LogEvent(payable(msg.sender), string.concat("Fallback received " , Utils.uintToString(msg.value)));
    }
    receive() external payable {
        emit LogEvent(payable(msg.sender), string.concat("Receive fallback received " , Utils.uintToString(msg.value)));
    }


}