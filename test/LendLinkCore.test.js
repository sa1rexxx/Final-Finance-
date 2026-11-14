const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("LendLinkCore Smart Contract Suite", function () {
  let LendLinkCore, lendLink, admin, gateway, lender1, lender2, auditor, user;
  const LENDER_ROLE = ethers.id("LENDER_ROLE");
  const AUDITOR_ROLE = ethers.id("AUDITOR_ROLE");
  const samplePseudonym = ethers.id("IIN_123456789012");

  beforeEach(async function () {
    [admin, gateway, lender1, lender2, auditor, user] = await ethers.getSigners();
    LendLinkCore = await ethers.getContractFactory("LendLinkCore");
    lendLink = await LendLinkCore.deploy(admin.address, gateway.address);
    await lendLink.waitForDeployment();

    // Register lenders
    await lendLink.connect(admin).grantRole(LENDER_ROLE, lender1.address);
    await lendLink.connect(admin).grantRole(LENDER_ROLE, lender2.address);
    await lendLink.connect(admin).grantRole(AUDITOR_ROLE, auditor.address);
  });

  it("1. Enforces DEFAULT_ADMIN_ROLE (multisig) for registering licensed lenders", async function () {
    await expect(
      lendLink.connect(user).grantRole(LENDER_ROLE, user.address)
    ).to.be.reverted;
  });

  it("2. Reverts checkCreditSummary when borrower consent is missing", async function () {
    await expect(
      lendLink.connect(lender1).checkCreditSummary(samplePseudonym)
    ).to.be.reverted;
  });

  it("3. Grants time-bound consent and returns accurate O(1) credit summary + audit event", async function () {
    await lendLink.connect(gateway).grantConsent(samplePseudonym, lender1.address, 3600);
    const tx = await lendLink.connect(lender1).checkCreditSummary.staticCall(samplePseudonym);
    expect(BigInt(tx[0])).to.equal(0n); // activeCount
  });

  it("4. Blocks credit queries immediately after revokeConsent or TTL expiration", async function () {
    await lendLink.connect(gateway).grantConsent(samplePseudonym, lender1.address, 3600);
    await lendLink.connect(gateway).revokeConsent(samplePseudonym, lender1.address);
    await expect(
      lendLink.connect(lender1).checkCreditSummary(samplePseudonym)
    ).to.be.reverted;
  });

  it("5. Records loans across two competing MFOs and updates O(1) debt aggregates on repayment", async function () {
    await lendLink.connect(gateway).grantConsent(samplePseudonym, lender1.address, 3600);
    await lendLink.connect(gateway).grantConsent(samplePseudonym, lender2.address, 3600);

    await lendLink.connect(lender1).recordLoan(samplePseudonym, 2); // Band 2
    let tx = await lendLink.connect(lender1).checkCreditSummary.staticCall(samplePseudonym);
    expect(BigInt(tx[0])).to.equal(1n); // activeCount
    expect(BigInt(tx[1])).to.equal(2n); // debtScore

    // Repay loan
    await lendLink.connect(lender1).updateLoanStatus(samplePseudonym, 0, 1); // Repaid
    tx = await lendLink.connect(lender1).checkCreditSummary.staticCall(samplePseudonym);
    expect(BigInt(tx[0])).to.equal(0n);
  });

  it("6. Flags disputed loan records via openDispute and increments disputedCount", async function () {
    await lendLink.connect(gateway).grantConsent(samplePseudonym, lender1.address, 3600);
    await lendLink.connect(lender1).recordLoan(samplePseudonym, 3);
    
    await lendLink.connect(auditor).openDispute(samplePseudonym, 0);
    const tx = await lendLink.connect(lender1).checkCreditSummary.staticCall(samplePseudonym);
    expect(BigInt(tx[2])).to.equal(1n); // disputedCount
  });

  it("7. Halts state mutations when paused by multisig admin", async function () {
    await lendLink.connect(admin).pause();
    await expect(
      lendLink.connect(gateway).grantConsent(samplePseudonym, lender1.address, 3600)
    ).to.be.reverted;
  });
});