require('dotenv').config({ path: '.env.test' });

process.env.NODE_ENV = 'test';

if (!process.env.MONGO_TEST_URI) {
  throw new Error('MONGO_TEST_URI is missing');
}

jest.setTimeout(10000);
