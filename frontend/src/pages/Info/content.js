/**
 * Customer-service copy for the Shipping, Returns and FAQ pages.
 * Review and adjust these texts to match Timeline's actual policies before launch.
 * Delivery fees shown on the Shipping page are read live from the backend.
 */
export const INFO = {
  shipping: {
    title: 'Shipping Information',
    intro: 'We deliver across Nigeria and offer free pickup from our stores in Computer Village, Ikeja.',
    sections: [
      {
        heading: 'Delivery areas',
        body: 'We deliver to all 36 states and the FCT. Orders within Lagos are usually the fastest to arrive; delivery times to other states depend on the courier route.',
      },
      {
        heading: 'Delivery fees',
        body: 'Delivery fees are calculated automatically at checkout based on your state, and shown before you pay. Large orders can qualify for free delivery.',
        showRates: true,
      },
      {
        heading: 'Store pickup',
        body: 'Choose “Store pickup” at checkout to collect your order for free from our Main Office (#17 Oremeji Street) or Branch (#11B Otigba Street), Computer Village, Ikeja. We’ll contact you when it’s ready.',
      },
      {
        heading: 'Tracking your order',
        body: 'Every order has a tracking timeline — Order Placed, Payment Confirmed, Processing, Ready for Delivery, Shipped and Delivered. Follow it from your account or the Track Order page.',
      },
    ],
  },
  returns: {
    title: 'Returns',
    intro: 'We want you to be happy with every gadget you buy from Timeline.',
    sections: [
      {
        heading: 'Reporting a problem',
        body: 'If an item arrives damaged, faulty or different from what you ordered, contact us as soon as possible with your order number and photos of the item and packaging.',
      },
      {
        heading: 'Condition of returned items',
        body: 'Returned items should be complete, with original packaging, accessories and any free gifts included, so that we can inspect and process them quickly.',
      },
      {
        heading: 'How refunds or replacements work',
        body: 'Once we have inspected a returned item, we’ll let you know whether it qualifies for a repair, replacement or refund. Approved refunds are made to the original payment method.',
      },
      {
        heading: 'Need help?',
        body: 'Email timelinegadget@gmail.com or visit either of our stores in Computer Village, Ikeja and our team will guide you.',
      },
    ],
  },
  faqs: {
    title: 'Frequently Asked Questions',
    intro: 'Quick answers to common questions about shopping with Timeline Gadgets.',
    faqs: [
      { q: 'Where are your stores?', a: 'Our Main Office is at #17, Oremeji Street, Micro Station Plaza, Computer Village, Ikeja. Our Branch is at #11B, Otigba Street, opposite Fidelity Bank, Computer Village, Ikeja, Lagos.' },
      { q: 'Do you deliver outside Lagos?', a: 'Yes — we deliver nationwide. Your delivery fee is calculated at checkout based on your state.' },
      { q: 'How do I pay?', a: 'Online payments are processed securely by Paystack (card, bank transfer or USSD). Your order total is always calculated and verified by our server.' },
      { q: 'Can I pick up my order in store?', a: 'Yes. Choose “Store pickup” at checkout and select the location that suits you. Pickup is free.' },
      { q: 'How can I track my order?', a: 'Sign in and open “My Orders”, or use the Track Order page with your order number and email address.' },
      { q: 'Can I cancel an order?', a: 'Unpaid orders can be cancelled from your order page. For paid orders, please contact us as soon as possible.' },
      { q: 'Why can’t I add more of an item to my cart?', a: 'Our cart is connected to live stock levels. If you can’t increase the quantity, we don’t have more units available right now.' },
      { q: 'How do I contact you?', a: 'Email timelinegadget@gmail.com, send a message through our Contact page, or reach us on Instagram @timelinegadgets.' },
    ],
  },
}
