package client

import (
	"math"
	"math/rand"
	"time"
)

const (
	minBackoff = 1 * time.Second
	maxBackoff = 60 * time.Second
	jitter     = 0.25
)

// Reconnector implements exponential backoff with jitter.
type Reconnector struct {
	attempt int
}

// NewReconnector creates a new Reconnector.
func NewReconnector() *Reconnector {
	return &Reconnector{}
}

// Wait blocks for the appropriate backoff duration and returns false if stopped.
func (r *Reconnector) Wait(stopCh <-chan struct{}) bool {
	d := r.nextDelay()
	select {
	case <-time.After(d):
		return true
	case <-stopCh:
		return false
	}
}

// Reset resets the backoff counter (call after a successful connection).
func (r *Reconnector) Reset() {
	r.attempt = 0
}

func (r *Reconnector) nextDelay() time.Duration {
	// Exponential: min * 2^attempt, capped at max
	base := float64(minBackoff) * math.Pow(2, float64(r.attempt))
	if base > float64(maxBackoff) {
		base = float64(maxBackoff)
	}

	// Add jitter: ±25%
	j := base * jitter * (2*rand.Float64() - 1)
	d := time.Duration(base + j)
	if d < minBackoff {
		d = minBackoff
	}
	if d > maxBackoff {
		d = maxBackoff
	}

	r.attempt++
	return d
}
