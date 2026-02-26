package power

// Inhibitor prevents the system from sleeping while the runner is active.
type Inhibitor interface {
	// Start begins inhibiting system sleep. Returns an error if the
	// platform mechanism is unavailable; callers should treat this as
	// non-fatal (log and continue).
	Start() error

	// Stop releases the sleep inhibition. Safe to call multiple times.
	Stop()
}

// New returns a platform-appropriate Inhibitor.
// See inhibit_darwin.go, inhibit_linux.go, inhibit_other.go.
func New() Inhibitor {
	return newInhibitor()
}
