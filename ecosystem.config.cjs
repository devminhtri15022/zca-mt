module.exports = {
    apps: [
        {
            name: "zca-mt-bot",
            cwd: __dirname,
            script: "./node_modules/.bin/tsx",
            args: "examples/production-bot.ts",
            instances: 1,
            exec_mode: "fork",
            autorestart: true,
            max_memory_restart: "512M",
            min_uptime: "10s",
            max_restarts: 10,
            exp_backoff_restart_delay: 1_000,
            kill_timeout: 20_000,
            env_production: {
                NODE_ENV: "production",
            },
        },
    ],
};
