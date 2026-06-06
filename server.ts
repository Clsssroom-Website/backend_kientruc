import 'dotenv/config';
import app from './src/index.js';

const PORT = Number.parseInt(process.env.PORT ?? "5000", 10);

async function startServer() {
    app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch((error) => {
  console.error('Fatal error during server startup.', { error });
  process.exit(1);
});