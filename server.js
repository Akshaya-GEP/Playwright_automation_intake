import express from 'express';
import { exec } from 'child_process';
import cors from 'cors';
import { platform } from 'os';

const app = express();
const PORT = 3001;

// Determine the shell to use based on the platform
const isWindows = platform() === 'win32';
const shell = isWindows ? 'cmd.exe' : '/bin/bash';

// Allow the frontend to communicate with this server
app.use(cors());
app.use(express.json());

// Mapping of Agent IDs to your Playwright Commands
const AGENT_COMMANDS = {
    '1': 'npm run test:headed -- --project=chromium automation/tests/agent1.spec.ts',
    '1.1': 'npm run test:headed -- --project=chromium automation/tests/agent1.1.spec.ts',
    '1.2': 'npm run test:headed -- --project=chromium automation/tests/agent1.2.spec.ts',
    '2': 'npm run test:headed -- --project=chromium automation/tests/agent2.spec.ts',
    '3': 'npm run test:headed -- --project=chromium automation/tests/agent3.spec.ts',
    '3.1': 'npm run test:headed -- --project=chromium automation/tests/agent3_1.spec.ts',
    '4': 'npm run test:headed -- --project=chromium automation/tests/agent4.spec.ts',
    '5': 'npm run test:headed -- --project=chromium automation/tests/agent5.spec.ts',
};

// API Endpoint to trigger the test
app.post('/run-test', (req, res) => {
    const { agentId } = req.body;
    const command = AGENT_COMMANDS[agentId];

    if (!command) {
        return res.status(400).json({ error: 'Invalid Agent ID' });
    }

    console.log(`Received request to run Agent ${agentId}`);
    console.log(`Executing: ${command}`);

    // Execute the command in the system terminal
    // The shell option will handle Windows/Unix differences automatically
    const childProcess = exec(command, { 
        cwd: process.cwd(),
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large outputs
        shell: shell
    }, (error, stdout, stderr) => {
        // Log output regardless of success/failure
        if (stdout) {
            console.log(`\n=== STDOUT ===\n${stdout}\n`);
        }
        if (stderr) {
            console.log(`\n=== STDERR ===\n${stderr}\n`);
        }
        
        if (error) {
            // Non-zero exit codes are expected for test failures
            // Only log as error if it's a real execution problem
            if (error.code === 'ENOENT' || error.code === 'EACCES') {
                console.error(`\n❌ Failed to execute command: ${error.message}`);
                console.error(`Exit code: ${error.code}`);
            } else {
                // Test likely failed (non-zero exit), but command executed successfully
                console.log(`\n⚠️  Command completed with exit code: ${error.code}`);
                console.log(`This is normal if tests failed. Check output above for details.`);
            }
            return;
        }
        
        console.log(`\n✅ Command completed successfully`);
    });

    // Handle process events
    childProcess.on('error', (error) => {
        console.error(`Failed to start process: ${error.message}`);
    });

    childProcess.on('exit', (code, signal) => {
        console.log(`Process exited with code ${code} and signal ${signal}`);
    });

    // Respond immediately so the UI doesn't freeze while the test runs
    res.json({ message: `Test started for Agent ${agentId}`, command });
});

app.listen(PORT, () => {
    console.log(`🚀 Automation Runner Server running at http://localhost:${PORT}`);
});