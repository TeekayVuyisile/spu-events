import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { MotionGlobalConfig } from 'motion/react';
import { afterEach } from 'vitest';

// Animations add nothing to unit tests, and happy-dom rejects cancelled WAAPI animations.
MotionGlobalConfig.skipAnimations = true;

afterEach(cleanup);
