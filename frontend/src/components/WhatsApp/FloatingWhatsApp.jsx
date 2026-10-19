import whatsappLogo from '../../assets/whatsapp-logo.png'

const WHATSAPP_NUMBER = '2347062895442'
const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}`

/**
 * Floating WhatsApp button — fixed to the bottom-right of the viewport,
 * stays in place while scrolling, and opens a WhatsApp DM on click.
 */
export default function FloatingWhatsApp() {
  return (
    <div className="fixed inset-x-6 bottom-6 z-[200] flex justify-end sm:bottom-8 sm:inset-x-auto sm:right-6 lg:right-8">
      <a
        href={WHATSAPP_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Chat on WhatsApp"
        className="flex h-14 w-14 items-center justify-center shadow-lg shadow-black/20 transition-transform duration-200 hover:scale-105 hover:shadow-xl"
      >
        <img src={whatsappLogo} alt="WhatsApp" className="h-10 w-10 object-contain" />
      </a>
    </div>
  )
}
