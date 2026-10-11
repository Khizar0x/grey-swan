import { Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { AccountSettings } from './pages/AccountSettings'
import { AdminDisputes } from './pages/Admin'
import { AdminOverview } from './pages/AdminOverview'
import { AdminShell } from './pages/AdminShell'
import { DigitalCloud } from './pages/DigitalCloud'
import { EditListing } from './pages/EditListing'
import { Home } from './pages/Home'
import { ListItem } from './pages/ListItem'
import { ListingDetail } from './pages/ListingDetail'
import { Messages } from './pages/Messages'
import { MyListings } from './pages/MyListings'
import { MyRentals } from './pages/MyRentals'
import { RentalHandover } from './pages/RentalHandover'

function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="digital" element={<DigitalCloud />} />
        <Route path="listing/:pubkey" element={<ListingDetail />} />
        <Route path="listing/:pubkey/edit" element={<EditListing />} />
        <Route path="list-item" element={<ListItem />} />
        <Route path="my-rentals" element={<MyRentals />} />
        <Route path="my-listings" element={<MyListings />} />
        <Route path="messages" element={<Messages />} />
        <Route path="messages/:rentalPubkey" element={<Messages />} />
        <Route path="rental/:pubkey" element={<RentalHandover />} />
        <Route path="account" element={<AccountSettings />} />
        <Route path="admin" element={<AdminShell />}>
          <Route index element={<AdminOverview />} />
          <Route path="disputes" element={<AdminDisputes />} />
        </Route>
      </Route>
    </Routes>
  )
}

export default App
