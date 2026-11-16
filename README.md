Educational project for the course Introduction to Finance. Not a real product, service or investment offer. Do not use with real funds.

# LendLink Smart Contract Prototype

Educational project for **Introduction to Finance** at Astana IT University.  
Not a real product or live financial network.

## Quick Start Guide

1. **Install Node.js** (v18 or higher recommended).
2. **Install dependencies**:
   ```bash
   npm install
   ```
3. **Run Hardhat automated unit tests**:
   ```bash
   npx hardhat test
   ```
https://drive.google.com/file/d/118cR_7VPWJWsoXEb6gNuANdTK_DlGnoW/view?usp=sharing

Intro
We have one smart contract and seven tests. Each test is one small scenario. Before every test, we create a fresh copy of the contract. Each test checks one rule.  

Test 1: Only the admin can give roles
A normal user tries to give himself the lender role. The contract rejects this action. Only the admin can give roles.   

Test 2: No consent, no data
A lender asks for a borrower summary, but there is no consent. The contract rejects the request.   

Test 3: Consent allows the check
The consent gateway gives the lender consent for 3,600 seconds, which is one hour. Then the lender asks for the summary. The request works, and the summary shows zero active loans, because we have not recorded any loan yet.   

Test 4: Ending the consent closes the access
The gateway gives consent and then ends it right away. Then the lender asks for the summary. The contract rejects the request.   

Test 5: Loans and the counters
Lender 1 records a loan in amount range 2. The summary shows one active loan and a debt score of 2. Then the lender marks the loan as repaid. The number of active loans goes back to zero.   

Test 6: Disputes
Lender 1 records a loan in amount range 3. Then the auditor opens a dispute on this loan. The summary now shows one disputed loan.   

Test 7: Emergency stop
The admin pauses the contract. After this, the gateway cannot give new consent. The contract blocks the action. 
