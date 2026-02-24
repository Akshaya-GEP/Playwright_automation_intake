Feature: Supplier offboarding (Agents 1 / 1.1 / 1.2 / 1.3)

  # Data is selected by SNO from CSV: automation/test-data/supplierOffboarding.csv
  Scenario Outline: Run supplier offboarding via agent <SNO>
    Given supplier offboarding test data exists for "<SNO>"
    And I open Qube Mesh and start Auto Invoke for agent index 0
    When I run supplier offboarding workflow for "<SNO>"
    Then the workflow should reach the end screen

    Examples:
      | SNO |
      | 1   |
      | 1.1 |
      | 1.2 |
      | 1.3 |


