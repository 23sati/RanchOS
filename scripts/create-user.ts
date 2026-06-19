import { auth } from '../packages/db/src/auth';

async function main() {
  console.log('Creating user...');
  try {
    const response = await auth.api.signUpEmail({
      body: {
        email: 'sati@county.ca.gov',
        password: 'password123',
        name: 'Sati',
      }
    });
    console.log('User created:', response);
  } catch (error) {
    console.error('Failed to create user:', error);
  }
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
