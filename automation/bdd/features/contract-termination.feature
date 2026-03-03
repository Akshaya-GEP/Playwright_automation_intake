Feature: Contract Termination Workflow

  As a user
  I want to terminate a contract
  So that I can finalize the contract lifecycle

  Background:
    Given the user is logged into the application

  Scenario Outline: Contract Termination for different scenarios
    When the user initiates termination with query "<Query>" for Sno "<Sno>"
    Then the termination request should be successfully created for Sno "<Sno>"

    Examples:
      | Sno | Query                        |
      | 3   | Terminate contract CDR0027626 |
      | 3.1 | Terminate contract CDR0027626 |
