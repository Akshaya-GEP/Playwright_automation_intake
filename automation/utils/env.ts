import dotenv from 'dotenv';

dotenv.config();

export const REQUIRED_ENV_VARS = ['BASE_URL', 'USER_ID', 'PASSWORD', 'QUBE_MESH_URL'] as const;

export function getMissingRequiredEnvVars(): string[] {
  return REQUIRED_ENV_VARS.filter((k) => !(process.env[k] || '').trim());
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function optional(name: string): string | undefined {
  const v = (process.env[name] || '').trim();
  return v || undefined;
}

export type EnvConfig = {
  baseURL: string;
  userId: string;
  password: string;
  qubeMeshUrl: string;

  // Queries
  userQuery: string;
  userQuery2: string;
  userQuery3: string;
  userQuery4: string;
  userQuery1_3?: string;

  // Agent Specific Params
  reasonOffboard?: string;
  reasonAmend?: string;
  reasonAmend2?: string;
  terminationStatus?: string;
  terminationStatus3?: string;
  terminationStatus3_1?: string;
  terminationDate3?: string;
  terminationYear3?: string;
  terminationMonth3?: string;
  terminationDay3?: string;
  reasonTerminate?: string;
  reasonTerminate3?: string;
  reasonTerminate3_1?: string;
  supplierName?: string;
  supplierCode?: string;

  // Agent 4 Specifics
  reasonForExtension?: string;
  reasonForExtension2?: string;
  modifications?: string;
  extensionDate4?: string;
  extensionYear4?: string;
  extensionMonth4?: string;
  extensionDay4?: string;
  updateOption?: string;
  currency?: string;
  estimatedCost?: string;
  approval?: string;

  // Agent 1.1 (Adobe) Specifics
  userQueryAdobe?: string;
  reasonOffboardAdobe?: string;
  supplierNameAdobe?: string;
  supplierCodeAdobe?: string;

  // Agent 1.2 (Workday) Specifics
  userQueryWorkday?: string;
  reasonOffboardWorkday?: string;
  supplierNameWorkday?: string;
  supplierCodeWorkday?: string;

  // Agent 5 Specifics
  userQuery5?: string;
  supplierName5?: string;
  supplierCode5?: string;
  updateType5?: string;
  updateType5_2?: string; // TC2
  reasonAction5?: string;
  reasonAction5_2?: string; // TC2
  uploadFile5?: string;

  agents: [string, string, string, string, string];
};

export function getEnv(): EnvConfig {
  const baseURL = required('BASE_URL');
  const userId = required('USER_ID');
  const password = required('PASSWORD');
  const qubeMeshUrl = required('QUBE_MESH_URL');

  // Queries
  const userQuery = process.env.USER_QUERY || 'Hello from Playwright';
  const userQuery2 = process.env.USER_QUERY2 || 'Hello from Playwright (Agent 2)';
  const userQuery3 = process.env.USER_QUERY3 || 'Hello from Playwright (Agent 3)';
  const userQuery4 = process.env.userQuery4 || process.env.USER_QUERY4 || 'Hello from Playwright (Agent 4)';
  const userQuery1_3 = optional('USER_QUERY_1_3') || optional('USER_QUERY1_3');

  // Existing Optional Params
  const reasonOffboard = optional('REASON_OFFBOARD');
  const reasonAmend = optional('REASON_AMEND');
  const reasonAmend2 = optional('REASON_AMEND_2');
  const terminationStatus = optional('TERMINATION_STATUS');
  const terminationStatus3 = optional('TERMINATION_STATUS_3');
  const terminationStatus3_1 = optional('TERMINATION_STATUS_3_1');
  const terminationDate3 = optional('TERMINATION_DATE_3');
  const terminationYear3 = optional('TERMINATION_YEAR_3');
  const terminationMonth3 = optional('TERMINATION_MONTH_3');
  const terminationDay3 = optional('TERMINATION_DAY_3');
  const reasonTerminate = optional('REASON_TERMINATE');
  const reasonTerminate3 = optional('REASON_TERMINATE_3');
  const reasonTerminate3_1 = optional('REASON_TERMINATE_3_1');
  const supplierName = optional('SUPPLIER_NAME');
  const supplierCode = optional('SUPPLIER_CODE');

  // Agent 4 Optional Params
  const reasonForExtension = optional('reasonForExtension') || optional('REASON_FOR_EXTENSION');
  const reasonForExtension2 = optional('REASON_FOR_EXTENSION_2');
  const modifications = optional('modifications') || optional('MODIFICATIONS');
  const extensionDate4 = optional('EXTENSION_DATE_4');
  const extensionYear4 = optional('EXTENSION_YEAR_4');
  const extensionMonth4 = optional('EXTENSION_MONTH_4');
  const extensionDay4 = optional('EXTENSION_DAY_4');
  const updateOption = optional('update_option') || optional('UPDATE_OPTION');
  const currency = optional('currency') || optional('CURRENCY');
  const estimatedCost = optional('estimated_cost') || optional('ESTIMATED_COST');
  const approval = optional('approval') || optional('APPROVAL');

  // Agent 1.1 (Adobe) Optional Params
  const userQueryAdobe = optional('USER_QUERY_ADOBE');
  const reasonOffboardAdobe = optional('REASON_OFFBOARD_ADOBE') || optional('OFFBOARDING_REASON_ADOBE');
  const supplierNameAdobe = optional('SUPPLIER_NAME_ADOBE');
  const supplierCodeAdobe = optional('SUPPLIER_CODE_ADOBE');

  // Agent 1.2 (Workday) Optional Params
  const userQueryWorkday = optional('USER_QUERY_WORKDAY');
  const reasonOffboardWorkday = optional('REASON_OFFBOARD_WORKDAY') || optional('OFFBOARDING_REASON_WORKDAY');
  const supplierNameWorkday = optional('SUPPLIER_NAME_WORKDAY');
  const supplierCodeWorkday = optional('SUPPLIER_CODE_WORKDAY');

  // Agent 5 Optional Params
  const userQuery5 = optional('USER_QUERY_5');
  const supplierName5 = optional('SUPPLIER_NAME_5');
  const supplierCode5 = optional('SUPPLIER_CODE_5');
  const updateType5 = optional('UPDATE_TYPE_5') || optional('UPDATE_5');
  const updateType5_2 = optional('UPDATE_TYPE_5_2') || optional('UPDATE_TYPE_5.2'); // Added mapping for .2
  const reasonAction5 = optional('REASON_ACTION_5');
  const reasonAction5_2 = optional('REASON_ACTION_5_2') || optional('REASON_ACTION_5.2'); // Added mapping for .2
  const uploadFile5 = optional('UPLOAD_FILE_5');

  // Preferred: AGENT_1..AGENT_5 (explicit)
  const explicitAgents = [
    (process.env.AGENT_1 || '').trim(),
    (process.env.AGENT_2 || '').trim(),
    (process.env.AGENT_3 || '').trim(),
    (process.env.AGENT_4 || '').trim(),
    (process.env.AGENT_5 || '').trim()
  ].filter(Boolean);

  // Back-compat: AGENTS=comma,separated,list
  const listAgents = (process.env.AGENTS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const fallbackAgents = ['Agent 1', 'Agent 2', 'Agent 3', 'Agent 4', 'Agent 5'];

  const merged = (explicitAgents.length ? explicitAgents : listAgents.length ? listAgents : fallbackAgents)
    .slice(0, 5);

  if (merged.length !== 5) {
    throw new Error('Expected 5 agents (use AGENT_1..AGENT_5 or AGENTS with 5 comma-separated values).');
  }

  const agents = merged as [string, string, string, string, string];

  return {
    baseURL,
    userId,
    password,
    qubeMeshUrl,
    userQuery,
    userQuery2,
    userQuery3,
    userQuery4,
    userQuery1_3,
    reasonOffboard,
    reasonAmend,
    reasonAmend2,
    terminationStatus,
    terminationStatus3,
    terminationStatus3_1,
    terminationDate3,
    terminationYear3,
    terminationMonth3,
    terminationDay3,
    reasonTerminate,
    reasonTerminate3,
    reasonTerminate3_1,
    supplierName,
    supplierCode,
    reasonForExtension,
    reasonForExtension2,
    modifications,
    extensionDate4,
    extensionYear4,
    extensionMonth4,
    extensionDay4,
    updateOption,
    currency,
    estimatedCost,
    approval,
    userQueryAdobe,
    reasonOffboardAdobe,
    supplierNameAdobe,
    supplierCodeAdobe,
    userQueryWorkday,
    reasonOffboardWorkday,
    supplierNameWorkday,
    supplierCodeWorkday,
    userQuery5,
    supplierName5,
    supplierCode5,
    updateType5,
    updateType5_2,
    reasonAction5,
    reasonAction5_2,
    uploadFile5,
    agents,
  };
}