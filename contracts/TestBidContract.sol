pragma solidity >=0.8.0 <0.9.0;
import "./BidContract.sol";

contract TestBidContract is BidContract {
    uint time;
    constructor(
        string memory _bidItem, uint _minBidInWei, uint _reservationInWei, uint _durationInMin
    ) BidContract(_bidItem, _minBidInWei, _reservationInWei,_durationInMin) {

    }
    function currentTime() internal override view returns(uint) {
        return time;
    }

    function setCurrentTime(uint newTime) public {
        time = newTime;
    }


}