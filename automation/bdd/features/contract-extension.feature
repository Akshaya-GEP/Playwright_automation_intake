Feature: Contract Extension Agent

  As a user, I want to extend a contract using Agent 4

  Scenario: Extend contract with future date (Agent 4)
    Given I am on the dashboard
    When I run Agent 4 workflow for sno "4"
    Then the contract extension request should be created successfully

  Scenario: Extend contract with alternate details (Agent 4.1)
    Given I am on the dashboard
    When I run Agent 4 workflow for sno "4.1"
    Then the contract extension request should be created successfully
