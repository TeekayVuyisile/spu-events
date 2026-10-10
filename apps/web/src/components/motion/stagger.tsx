import { motion, type HTMLMotionProps } from 'motion/react';
import { fadeUp, staggerChildren } from '@/lib/motion';

/** Parent that reveals its <StaggerItem> children one after another (40ms apart). */
export function Stagger({ stagger, ...props }: HTMLMotionProps<'div'> & { stagger?: number }) {
  return (
    <motion.div variants={staggerChildren(stagger)} initial="hidden" animate="show" {...props} />
  );
}

export function StaggerItem(props: HTMLMotionProps<'div'>) {
  return <motion.div variants={fadeUp} {...props} />;
}
