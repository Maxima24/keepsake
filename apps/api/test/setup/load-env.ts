import * as dotenv from 'dotenv';
import * as path from 'path';

// Loaded before AppModule imports, so PrismaService + JwtModule bind to the
// test config. Does not override an already-set DATABASE_URL (so CI can inject one).
dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });
