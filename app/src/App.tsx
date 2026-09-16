import { Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Home } from './pages/Home'
import { ListItem } from './pages/ListItem'
import { ListingDetail } from './pages/ListingDetail'
import { MyListings } from './pages/MyListings'
import { MyRentals } from './pages/MyRentals'
import { RentalHandover } from './pages/RentalHandover'

function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="listing/:pubkey" element={<ListingDetail />} />
        <Route path="list-item" element={<ListItem />} />
        <Route path="my-rentals" element={<MyRentals />} />
        <Route path="my-listings" element={<MyListings />} />
        <Route path="rental/:pubkey" element={<RentalHandover />} />
      </Route>
    </Routes>
  )
}

export default App
