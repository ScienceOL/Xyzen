//go:build !darwin && !linux

package power

type noopInhibitor struct{}

func newInhibitor() Inhibitor {
	return &noopInhibitor{}
}

func (n *noopInhibitor) Start() error { return nil }
func (n *noopInhibitor) Stop()        {}
