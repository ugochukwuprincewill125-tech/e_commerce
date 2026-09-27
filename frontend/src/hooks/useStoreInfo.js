import { useQuery } from '@tanstack/react-query'

import { storeService } from '../services/productService'

/** Company details, locations and shipping rules from the backend. */
export const FALLBACK_COMPANY = {
  name: 'Timeline Global Systems Limited',
  short_name: 'Timeline Gadgets',
  tagline: 'Home of Quality Gadgets',
  email: 'timelinegadget@gmail.com',
  phones: [],
  instagram: 'https://www.instagram.com/timelinegadgets/',
  instagram_handle: '@timelinegadgets',
  locations: [
    {
      id: 'main-office',
      label: 'Main Office',
      lines: ['#17, Oremeji Street,', 'Micro Station Plaza,', 'Computer Village,', 'Ikeja, Lagos, Nigeria.'],
      map_query: '17 Oremeji Street, Computer Village, Ikeja, Lagos',
    },
    {
      id: 'branch',
      label: 'Branch',
      lines: ['#11B, Otigba Street,', 'Opposite Fidelity Bank,', 'Computer Village,', 'Ikeja, Lagos, Nigeria.'],
      map_query: '11B Otigba Street, Computer Village, Ikeja, Lagos',
    },
  ],
  business_hours: [
    { days: 'Monday – Friday', hours: '8:30 AM – 6:30 PM' },
    { days: 'Saturday', hours: '9:00 AM – 6:00 PM' },
    { days: 'Sunday & Public Holidays', hours: 'Closed' },
  ],
}

export default function useStoreInfo() {
  const query = useQuery({
    queryKey: ['store-info'],
    queryFn: storeService.info,
    staleTime: 1000 * 60 * 30,
  })
  return {
    ...query,
    company: query.data?.company || FALLBACK_COMPANY,
    shipping: query.data?.shipping,
    states: query.data?.states || [],
  }
}
