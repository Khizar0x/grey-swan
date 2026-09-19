use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Only the counter authority can update this counter")]
    Unauthorized,
    #[msg("Counter has reached the maximum value")]
    CounterOverflow,
    #[msg("Rental price must be greater than zero")]
    InvalidRentalPrice,
    #[msg("Deposit amount must be greater than zero")]
    InvalidDepositAmount,
    #[msg("This listing is not currently available")]
    ListingNotAvailable,
    #[msg("Only the listing owner can confirm this return")]
    NotListingOwner,
    #[msg("This rental is not in a state that can be confirmed")]
    InvalidRentalStatus,
    #[msg("Only the renter can claim this refund")]
    NotRenter,
    #[msg("The refund waiting period has not yet elapsed")]
    TimeoutNotElapsed,
    #[msg("Item name must be 50 characters or fewer")]
    ItemNameTooLong,
    #[msg("Description must be 1200 characters or fewer")]
    DescriptionTooLong,
    #[msg("Photos link must be 200 characters or fewer")]
    PhotosLinkTooLong,
    #[msg("Estimated value must be greater than zero for rare and antique items")]
    InvalidEstimatedValue,
    #[msg("Deposit cannot exceed 45% of the item's estimated value")]
    DepositExceedsCap,
    #[msg("Rentals must be between 1 and 12 weeks")]
    InvalidRentalDuration,
    #[msg("Amount calculation overflowed")]
    MathOverflow,
    #[msg("The previous handover step must be completed first")]
    PhaseOutOfOrder,
    #[msg("Tracking number must be 40 characters or fewer")]
    TrackingNumberTooLong,
    #[msg("A photos link is required for this step")]
    PhotosLinkRequired,
    #[msg("A tracking number is required for this step")]
    TrackingNumberRequired,
    #[msg("Only the renter can complete this step")]
    NotRenterForPhase,
    #[msg("Only the owner can complete this step")]
    NotOwnerForPhase,
    #[msg("All four handover steps must be completed before confirming")]
    HandoverIncomplete,
    #[msg("Only the admin wallet can resolve disputes")]
    NotAdmin,
    #[msg("This rental is not under dispute")]
    NotDisputed,
    #[msg("A reason is required when raising an issue")]
    DisputeReasonRequired,
    #[msg("Reason must be 300 characters or fewer")]
    DisputeReasonTooLong,
    #[msg("The resolution amounts must equal the total funds held")]
    ResolutionAmountMismatch,
}