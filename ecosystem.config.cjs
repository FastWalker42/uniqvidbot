module.exports = {
  apps: [
    {
      name: "uniqvidbot",
      script: "src/index.ts",
      interpreter: "bun",
      env: {
        NODE_ENV: "production",
      },
      watch: true,
      ignore_watch: ["node_modules", ".git", "*.log", "downloads"],
      max_memory_restart: "512M",
      restart_delay: 3000,
      max_restarts: 10,
    },
  ],
};
