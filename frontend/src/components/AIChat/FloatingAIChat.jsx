import { motion, AnimatePresence } from 'framer-motion'
import { useState } from 'react'
import AIChatWidget from './AIChatWidget'

import aiLogoSolid from '../../assets/AI-removebg-preview.png'

/**
 * Floating Shopping Assistant button — fixed to the bottom-right of the
 * viewport, stays in place while scrolling, and opens a chat popup on click.
 */
export default function FloatingAIChat() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <div className="fixed inset-x-6 bottom-6 z-[200] flex justify-end sm:bottom-8 sm:inset-x-auto sm:right-6 lg:right-8">
        <AnimatePresence mode="wait">
          {!open && (
            <motion.button
              key="button"
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Shopping assistant"
              className="flex h-16 w-16 items-center justify-center transition-transform duration-200 hover:scale-105"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
            >
              <img src={aiLogoSolid} alt="AI" className="h-16 w-16 drop-shadow-lg drop-shadow-black/30 object-contain" />
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {open && <AIChatWidget onClose={() => setOpen(false)} />}
    </>
  )
}
