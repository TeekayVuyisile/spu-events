import { describe, expect, it } from 'vitest';
import { createInviteSchema, signupSchema } from './auth';

const valid = {
  firstName: ' Lerato ',
  lastName: 'Mokoena',
  studentNumber: '202312345',
  email: '  Lerato@SPU.ac.za ',
  password: 'correct horse battery',
};

describe('signupSchema', () => {
  it('normalises names and email', () => {
    const parsed = signupSchema.parse(valid);
    expect(parsed.firstName).toBe('Lerato');
    expect(parsed.email).toBe('lerato@spu.ac.za');
  });

  it('rejects a student number that is not 9 digits', () => {
    const result = signupSchema.safeParse({ ...valid, studentNumber: '12345' });
    expect(result.error?.issues[0]?.path).toEqual(['studentNumber']);
  });

  it('rejects short passwords', () => {
    expect(signupSchema.safeParse({ ...valid, password: 'short' }).success).toBe(false);
  });

  it('strips a smuggled role', () => {
    const parsed = signupSchema.parse({ ...valid, role: 'admin' });
    expect(parsed).not.toHaveProperty('role');
  });
});

describe('createInviteSchema', () => {
  it('never allows inviting a student', () => {
    const result = createInviteSchema.safeParse({ ...valid, role: 'student' });
    expect(result.error?.issues[0]?.path).toEqual(['role']);
  });
});
