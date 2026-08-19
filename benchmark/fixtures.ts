export interface BenchmarkFixture {
  id: string;
  category: 'repeated-label' | 'repeated-class' | 'nested-landmark' | 'generated-class' | 'aria-only' | 'safe-test-id';
  html: string;
  /** Ground-truth selector; it is not supplied to element capture. */
  target: string;
}

export const fixtures: readonly BenchmarkFixture[] = [
  { id: 'aria-only-01', category: 'aria-only', html: '<main><h1>Account</h1><button role="button" aria-label="Open profile">Open</button><button>Open</button></main>', target: '[role="button"][aria-label="Open profile"]' },
  { id: 'aria-only-02', category: 'aria-only', html: '<main><h1>Account</h1><button role="button" aria-label="Open billing">Open</button><button>Open</button></main>', target: '[role="button"][aria-label="Open billing"]' },
  { id: 'aria-only-03', category: 'aria-only', html: '<main><h1>Account</h1><button role="button" aria-label="Open security">Open</button><button>Open</button></main>', target: '[role="button"][aria-label="Open security"]' },
  { id: 'aria-only-04', category: 'aria-only', html: '<main><h1>Account</h1><button role="button" aria-label="Open notifications">Open</button><button>Open</button></main>', target: '[role="button"][aria-label="Open notifications"]' },
  { id: 'aria-only-05', category: 'aria-only', html: '<main><h1>Account</h1><button role="button" aria-label="Open privacy">Open</button><button>Open</button></main>', target: '[role="button"][aria-label="Open privacy"]' },

  { id: 'generated-class-01', category: 'generated-class', html: '<main><h1>Orders</h1><button class="sc-a1f3">View order</button><button class="sc-b2e4">View order</button></main>', target: '.sc-a1f3' },
  { id: 'generated-class-02', category: 'generated-class', html: '<main><h1>Orders</h1><button class="css-4p7x">View order</button><button class="css-8k2m">View order</button></main>', target: '.css-4p7x' },
  { id: 'generated-class-03', category: 'generated-class', html: '<main><h1>Orders</h1><button class="jsx-19ab">View order</button><button class="jsx-51cd">View order</button></main>', target: '.jsx-19ab' },
  { id: 'generated-class-04', category: 'generated-class', html: '<main><h1>Orders</h1><button class="emotion-3f9a">View order</button><button class="emotion-7c1d">View order</button></main>', target: '.emotion-3f9a' },
  { id: 'generated-class-05', category: 'generated-class', html: '<main><h1>Orders</h1><button class="tw-2x8q">View order</button><button class="tw-6m4n">View order</button></main>', target: '.tw-2x8q' },

  { id: 'nested-landmark-01', category: 'nested-landmark', html: '<main><h1>Profile</h1><section><h2>Preferences</h2><div><button class="target-action">Save</button><button>Save</button></div></section></main>', target: '.target-action' },
  { id: 'nested-landmark-02', category: 'nested-landmark', html: '<main><h1>Profile</h1><section><h2>Security</h2><div><button class="target-action">Save</button><button>Save</button></div></section></main>', target: '.target-action' },
  { id: 'nested-landmark-03', category: 'nested-landmark', html: '<main><h1>Profile</h1><section><h2>Billing</h2><div><button class="target-action">Save</button><button>Save</button></div></section></main>', target: '.target-action' },
  { id: 'nested-landmark-04', category: 'nested-landmark', html: '<main><h1>Profile</h1><section><h2>Alerts</h2><div><button class="target-action">Save</button><button>Save</button></div></section></main>', target: '.target-action' },
  { id: 'nested-landmark-05', category: 'nested-landmark', html: '<main><h1>Profile</h1><section><h2>Appearance</h2><div><button class="target-action">Save</button><button>Save</button></div></section></main>', target: '.target-action' },

  { id: 'repeated-class-01', category: 'repeated-class', html: '<main><h1>Inbox</h1><button id="archive-thread" class="button button-primary">Archive</button><button class="button button-primary">Archive</button></main>', target: '#archive-thread' },
  { id: 'repeated-class-02', category: 'repeated-class', html: '<main><h1>Inbox</h1><button id="reply-thread" class="button button-primary">Reply</button><button class="button button-primary">Reply</button></main>', target: '#reply-thread' },
  { id: 'repeated-class-03', category: 'repeated-class', html: '<main><h1>Inbox</h1><button id="forward-thread" class="button button-primary">Forward</button><button class="button button-primary">Forward</button></main>', target: '#forward-thread' },
  { id: 'repeated-class-04', category: 'repeated-class', html: '<main><h1>Inbox</h1><button id="mark-thread" class="button button-primary">Mark read</button><button class="button button-primary">Mark read</button></main>', target: '#mark-thread' },
  { id: 'repeated-class-05', category: 'repeated-class', html: '<main><h1>Inbox</h1><button id="move-thread" class="button button-primary">Move</button><button class="button button-primary">Move</button></main>', target: '#move-thread' },

  { id: 'repeated-label-01', category: 'repeated-label', html: '<main><h1>Profile</h1><button id="profile-save">Save</button><button>Save</button></main>', target: '#profile-save' },
  { id: 'repeated-label-02', category: 'repeated-label', html: '<main><h1>Settings</h1><button id="settings-save">Save</button><button>Save</button></main>', target: '#settings-save' },
  { id: 'repeated-label-03', category: 'repeated-label', html: '<main><h1>Billing</h1><button id="billing-save">Save</button><button>Save</button></main>', target: '#billing-save' },
  { id: 'repeated-label-04', category: 'repeated-label', html: '<main><h1>Security</h1><button id="security-save">Save</button><button>Save</button></main>', target: '#security-save' },
  { id: 'repeated-label-05', category: 'repeated-label', html: '<main><h1>Notifications</h1><button id="notifications-save">Save</button><button>Save</button></main>', target: '#notifications-save' },

  { id: 'safe-test-id-01', category: 'safe-test-id', html: '<main><h1>Checkout</h1><button data-testid="checkout-continue">Continue</button><button>Continue</button></main>', target: '[data-testid="checkout-continue"]' },
  { id: 'safe-test-id-02', category: 'safe-test-id', html: '<main><h1>Checkout</h1><button data-testid="shipping-continue">Continue</button><button>Continue</button></main>', target: '[data-testid="shipping-continue"]' },
  { id: 'safe-test-id-03', category: 'safe-test-id', html: '<main><h1>Checkout</h1><button data-testid="payment-continue">Continue</button><button>Continue</button></main>', target: '[data-testid="payment-continue"]' },
  { id: 'safe-test-id-04', category: 'safe-test-id', html: '<main><h1>Checkout</h1><button data-testid="review-continue">Continue</button><button>Continue</button></main>', target: '[data-testid="review-continue"]' },
  { id: 'safe-test-id-05', category: 'safe-test-id', html: '<main><h1>Checkout</h1><button data-testid="confirm-continue">Continue</button><button>Continue</button></main>', target: '[data-testid="confirm-continue"]' },
];
