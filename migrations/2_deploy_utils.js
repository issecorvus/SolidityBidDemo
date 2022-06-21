let Utils = artifacts.require("./Utils.sol");
let BidContract = artifacts.require("./BidContract.sol");
let TestBidContract = artifacts.require("./TestBidContract.sol");

module.exports = async function(deployer) {
    await deployer.deploy(Utils);
    deployer.link(Utils, BidContract);
    deployer.link(Utils, TestBidContract);
};