// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

// Collateralized Loan Contract
contract CollateralizedLoan {
    struct Loan {
        address borrower;
        address lender;
        uint collateralAmount;
        uint loanAmount;
        uint interestRate;
        uint dueDate;
        bool isFunded;
        bool isRepaid;
    }

    mapping(uint => Loan) public loans;
    uint public nextLoanId;

    event LoanRequested(uint loanId, address borrower, uint collateralAmount, uint loanAmount, uint interestRate, uint dueDate);
    event LoanFunded(uint loanId, address lender);
    event LoanRepaid(uint loanId, address borrower);
    event CollateralClaimed(uint loanId, address lender);

    modifier loanExists(uint _loanId) {
        require(_loanId < nextLoanId, "Loan does not exist.");
        _;
    }

    modifier notFunded(uint _loanId) {
        require(!loans[_loanId].isFunded, "Loan is already funded.");
        _;
    }

    function depositCollateralAndRequestLoan(uint _interestRate, uint _duration, uint _collateralAmount) external payable {
        require(msg.value > 0, "Collateral must be greater than zero.");
        uint loanAmount = msg.value; 
        uint dueDate = block.timestamp + _duration;

        loans[nextLoanId] = Loan({
            borrower: msg.sender,
            lender: address(0),
            collateralAmount: _collateralAmount,
            loanAmount: loanAmount,
            interestRate: _interestRate,
            dueDate: dueDate,
            isFunded: false,
            isRepaid: false
        });

        emit LoanRequested(nextLoanId, msg.sender, _collateralAmount, loanAmount, _interestRate, dueDate);
        nextLoanId++;
    }

    function fundLoan(uint _loanId) external payable loanExists(_loanId) notFunded(_loanId) {
        Loan storage loan = loans[_loanId];
        require(msg.value == loan.loanAmount, "Incorrect loan amount.");

        loan.lender = msg.sender;
        loan.isFunded = true;

        payable(loan.borrower).transfer(msg.value);

        emit LoanFunded(_loanId, msg.sender);
    }

    function repayLoan(uint _loanId) external payable loanExists(_loanId) {
        Loan storage loan = loans[_loanId];
        require(msg.sender == loan.borrower, "Only the borrower can repay the loan.");
        require(loan.isFunded, "Loan is not funded.");
        require(!loan.isRepaid, "Loan is already repaid.");
        require(block.timestamp <= loan.dueDate, "Loan is overdue.");

        uint repaymentAmount = loan.loanAmount + (loan.loanAmount * loan.interestRate / 100);
        require(msg.value == repaymentAmount, "Incorrect repayment amount.");

        loan.isRepaid = true;

        payable(loan.lender).transfer(msg.value);
        payable(loan.borrower).transfer(loan.collateralAmount);

        emit LoanRepaid(_loanId, msg.sender);
    }

    function claimCollateral(uint _loanId) external loanExists(_loanId) {
        Loan storage loan = loans[_loanId];
        require(msg.sender == loan.lender, "Only the lender can claim the collateral.");
        require(!loan.isRepaid, "Loan is already repaid.");
        require(block.timestamp > loan.dueDate, "Loan is not overdue.");

        payable(loan.lender).transfer(loan.collateralAmount);

        emit CollateralClaimed(_loanId, msg.sender);
    }
}
