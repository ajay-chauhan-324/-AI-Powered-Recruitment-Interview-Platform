import type { AvailableSlot } from './availability.service.js'

export class BookingValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BookingValidationError'
  }
}

export class SlotConflictError extends Error {
  alternatives: AvailableSlot[]
  constructor(alternatives: AvailableSlot[] = []) {
    super('The requested time is no longer available.')
    this.name = 'SlotConflictError'
    this.alternatives = alternatives
  }
}

export class AppointmentNotFoundError extends Error {
  constructor() {
    super('Appointment not found.')
    this.name = 'AppointmentNotFoundError'
  }
}
