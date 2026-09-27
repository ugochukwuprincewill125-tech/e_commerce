import { motion, useReducedMotion } from 'framer-motion'

/** Fades/slides children in when they scroll into view (once). */
export default function Reveal({ children, delay = 0, y = 24, className, as = 'div', ...props }) {
  const reduce = useReducedMotion()
  const Comp = motion[as] || motion.div
  return (
    <Comp
      className={className}
      initial={reduce ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
      {...props}
    >
      {children}
    </Comp>
  )
}

export const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
}

export const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
}
