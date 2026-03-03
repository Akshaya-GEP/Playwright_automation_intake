Feature: Contract Amendment (Agents 2 / 2.1)

  # Data is selected by SNO from CSV: automation/test-data/Contract Amendment.csv
  Scenario Outline: Run contract amendment via agent <SNO>
    Given contract amendment test data exists for "<SNO>"
    And I open Qube Mesh and start Auto Invoke for agent index <AGENT_INDEX>
    When I run contract amendment workflow for "<SNO>"
    Then the workflow should reach the end screen

    Examples:
      | SNO | AGENT_INDEX |
      | 2   | 1           |
      | 2.1 | 1           |
