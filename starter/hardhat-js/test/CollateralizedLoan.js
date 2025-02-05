// Importing necessary modules and functions from Hardhat and Chai for testing
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

// Describing a test suite for the CollateralizedLoan contract
describe("CollateralizedLoan", function () {
  async function deployCollateralizedLoanFixture() {
    const CollateralizedLoan = await ethers.getContractFactory("CollateralizedLoan");
    const [owner, borrower, lender] = await ethers.getSigners();
    const collateralizedLoan = await CollateralizedLoan.deploy();
    await collateralizedLoan.waitForDeployment();  // Updated deployment;
    return { collateralizedLoan, owner, borrower, lender };
  }
  
  it("Should deploy the contract and have a valid address", async function () {
    const { collateralizedLoan } = await loadFixture(deployCollateralizedLoanFixture);
    expect(collateralizedLoan.address).to.properAddress;
  });

  describe("Loan Request", function () {
    it("Should let a borrower deposit collateral and request a loan", async function () {
      const { collateralizedLoan, borrower } = await loadFixture(deployCollateralizedLoanFixture);
      const interestRate = 10;
      const duration = 3600; // 1 hour
      const collateral = ethers.parseEther("1.1");
      const loanAmount = ethers.parseEther("1");
      const currentTimestamp = (await ethers.provider.getBlock("latest")).timestamp; 
      

      await expect(
        collateralizedLoan.connect(borrower).depositCollateralAndRequestLoan(interestRate, duration, collateral, { value: loanAmount })
      ).to.emit(collateralizedLoan, "LoanRequested").withArgs(0, borrower.address, collateral, loanAmount, interestRate, currentTimestamp + duration);
    });
  });

  describe("Funding a Loan", function () {
    it("Allows a lender to fund a requested loan", async function () {
      const { collateralizedLoan, borrower, lender } = await loadFixture(deployCollateralizedLoanFixture);
      const interestRate = 10;
      const duration = 3600;
      const collateral = ethers.parseEther("1.1");
      const loanAmount = ethers.parseEther("1");

      // Borrower requests a loan
      await collateralizedLoan.connect(borrower).depositCollateralAndRequestLoan(interestRate, duration, collateral, { value: loanAmount });

      // Lender funds the loan
      await expect(collateralizedLoan.connect(lender).fundLoan(0, { value: loanAmount }))
        .to.emit(collateralizedLoan, "LoanFunded")
        .withArgs(0, lender.address);

      // Check loan is marked as funded
      const loan = await collateralizedLoan.loans(0);
      expect(loan.isFunded).to.be.true;
    });
  });

  describe("Repaying a Loan", function () {
    it("Enables the borrower to repay the loan fully", async function () {
      const { collateralizedLoan, borrower, lender } = await loadFixture(deployCollateralizedLoanFixture);
      const interestRate = 10;
      const duration = 3600;
      const collateral = ethers.parseEther("1.2");
      const loanAmount = ethers.parseEther("1");
      const repaymentAmount = ethers.parseEther("1.1"); // Loan + 10% interest

      // Borrower requests a loan
      await collateralizedLoan.connect(borrower).depositCollateralAndRequestLoan(interestRate, duration, collateral, { value: loanAmount });

      // Lender funds the loan
      await collateralizedLoan.connect(lender).fundLoan(0, { value: loanAmount });

      // Borrower repays the loan
      await expect(collateralizedLoan.connect(borrower).repayLoan(0, { value: repaymentAmount }))
        .to.emit(collateralizedLoan, "LoanRepaid")
        .withArgs(0, borrower.address);
    });
  });

  describe("Claiming Collateral", function () {
    it("Permits the lender to claim collateral if the loan isn't repaid on time", async function () {
      const { collateralizedLoan, borrower, lender } = await loadFixture(deployCollateralizedLoanFixture);
      const interestRate = 10;
      const duration = 3600;
      const collateral = ethers.parseEther("1.1");
      const loanAmount = ethers.parseEther("1");

      // Borrower requests a loan
      await collateralizedLoan.connect(borrower).depositCollateralAndRequestLoan(interestRate, duration, collateral, { value: loanAmount });

      // Lender funds the loan
      await collateralizedLoan.connect(lender).fundLoan(0, { value: loanAmount });

      // Simulate time passing by exceeding the due date
      await ethers.provider.send("evm_increaseTime", [duration + 1]);
      await ethers.provider.send("evm_mine");

      // Lender claims the collateral
      await expect(collateralizedLoan.connect(lender).claimCollateral(0))
        .to.emit(collateralizedLoan, "CollateralClaimed")
        .withArgs(0, lender.address);
    });
  });

  describe("Incorrect Scenarios", function () {
    it("Should revert when trying to fund a nonexistent loan", async function () {
      const { collateralizedLoan, lender } = await loadFixture(deployCollateralizedLoanFixture);
      const collateral = ethers.parseEther("1.1");
      const loanAmount = ethers.parseEther("1");
      await expect(collateralizedLoan.connect(lender).fundLoan(999, { value: loanAmount })).to.be.revertedWith("Loan does not exist.");
    });

    it("Should revert when repaying with an incorrect amount", async function () {
      const { collateralizedLoan, borrower, lender } = await loadFixture(deployCollateralizedLoanFixture);
      const interestRate = 10;
      const duration = 3600;
      const collateral = ethers.parseEther("1.1");
      const loanAmount = ethers.parseEther("1");
      const incorrectRepaymentAmount = ethers.parseEther("1.05"); // Less than required

      // Borrower requests a loan
      await collateralizedLoan.connect(borrower).depositCollateralAndRequestLoan(interestRate, duration, collateral, { value: loanAmount });

      // Lender funds the loan
      await collateralizedLoan.connect(lender).fundLoan(0, { value: loanAmount });

      // Borrower tries to repay with an incorrect amount
      await expect(collateralizedLoan.connect(borrower).repayLoan(0, { value: incorrectRepaymentAmount })).to.be.revertedWith("Incorrect repayment amount.");
    });

    it("Should revert when claiming collateral before the due date", async function () {
      const { collateralizedLoan, borrower, lender } = await loadFixture(deployCollateralizedLoanFixture);
      const interestRate = 10;
      const duration = 3600;
      const collateral = ethers.parseEther("1.1");
      const loanAmount = ethers.parseEther("1");

      // Borrower requests a loan
      await collateralizedLoan.connect(borrower).depositCollateralAndRequestLoan(interestRate, duration, collateral, { value: loanAmount });

      // Lender funds the loan
      await collateralizedLoan.connect(lender).fundLoan(0, { value: loanAmount });

      // Lender tries to claim collateral before due date
      await expect(collateralizedLoan.connect(lender).claimCollateral(0)).to.be.revertedWith("Loan is not overdue.");
    });
  });
});
