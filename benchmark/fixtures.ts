export type BenchmarkCategory = 'repeated-label' | 'repeated-class' | 'nested-landmark' | 'generated-class' | 'aria-only' | 'safe-test-id';
export type BenchmarkStratum = 'ambiguous-label' | 'unique-label';

export interface BenchmarkFixture {
  id: string;
  category: BenchmarkCategory;
  stratum: BenchmarkStratum;
  html: string;
  /** Ground-truth selector; it is not supplied to element capture. */
  target: string;
}

export const fixtures: readonly BenchmarkFixture[] = [
  { id: 'aria-only-01', category: 'aria-only', stratum: 'ambiguous-label', html: '<header><nav>Account</nav></header><main><button role="button" aria-label="Open profile">Open</button><button>Open</button></main>', target: '[aria-label="Open profile"]' },
  { id: 'aria-only-02', category: 'aria-only', stratum: 'unique-label', html: '<aside><h2>Profile</h2><button role="button" aria-label="Open profile">Open profile</button><a>Back</a></aside>', target: '[aria-label="Open profile"]' },
  { id: 'aria-only-03', category: 'aria-only', stratum: 'ambiguous-label', html: '<form><label>Preferences</label><button role="button" aria-label="Save preferences">Save</button><button>Save</button></form>', target: '[aria-label="Save preferences"]' },
  { id: 'aria-only-04', category: 'aria-only', stratum: 'unique-label', html: '<section><h2>Alerts</h2><div><button role="button" aria-label="Manage alerts">Manage alerts</button><span>Weekly summary</span></div></section>', target: '[aria-label="Manage alerts"]' },
  { id: 'aria-only-05', category: 'aria-only', stratum: 'ambiguous-label', html: '<dialog open><p>Cart</p><button role="button" aria-label="Close cart">Close</button><button>Close</button></dialog>', target: '[aria-label="Close cart"]' },

  { id: 'generated-class-01', category: 'generated-class', stratum: 'ambiguous-label', html: '<main><article><h2>Order</h2><button class="sc-a1f3">View order</button><button class="sc-b2e4">View order</button></article></main>', target: '.sc-a1f3' },
  { id: 'generated-class-02', category: 'generated-class', stratum: 'unique-label', html: '<aside><h2>Filters</h2><button class="css-4p7x">Clear filters</button><button class="css-8k2m">Help</button></aside>', target: '.css-4p7x' },
  { id: 'generated-class-03', category: 'generated-class', stratum: 'ambiguous-label', html: '<footer><span>Checkout</span><button class="jsx-19ab">Continue</button><button class="jsx-51cd">Continue</button></footer>', target: '.jsx-19ab' },
  { id: 'generated-class-04', category: 'generated-class', stratum: 'unique-label', html: '<nav><a class="emotion-3f9a">Account</a><a class="emotion-7c1d">Sign out</a></nav>', target: '.emotion-3f9a' },
  { id: 'generated-class-05', category: 'generated-class', stratum: 'unique-label', html: '<main><h1>Orders</h1><button class="sc-row">Review order</button><button class="sc-row">Help</button></main>', target: 'main > button:nth-of-type(1)' },

  { id: 'nested-landmark-01', category: 'nested-landmark', stratum: 'ambiguous-label', html: '<main><section><h2>Preferences</h2><div><button class="target-action">Save</button><button>Save</button></div></section></main>', target: '.target-action' },
  { id: 'nested-landmark-02', category: 'nested-landmark', stratum: 'unique-label', html: '<main><section><h2>Security</h2><div><button class="target-action">Enable passkeys</button><button>Cancel</button></div></section></main>', target: '.target-action' },
  { id: 'nested-landmark-03', category: 'nested-landmark', stratum: 'ambiguous-label', html: '<main><form><fieldset><legend>Shipping</legend><button class="target-action">Continue</button><button>Continue</button></fieldset></form></main>', target: '.target-action' },
  { id: 'nested-landmark-04', category: 'nested-landmark', stratum: 'unique-label', html: '<main><section><h2>Profile</h2><div><button class="action">Edit profile</button><button class="action">Cancel</button></div></section></main>', target: 'section button:nth-of-type(1)' },
  { id: 'nested-landmark-05', category: 'nested-landmark', stratum: 'ambiguous-label', html: '<aside><section><h2>Dialog</h2><button class="target-action">Close</button><button>Close</button></section></aside>', target: '.target-action' },

  { id: 'repeated-class-01', category: 'repeated-class', stratum: 'ambiguous-label', html: '<main><h1>Inbox</h1><button id="archive-thread" class="button primary">Archive</button><button class="button primary">Archive</button></main>', target: '#archive-thread' },
  { id: 'repeated-class-02', category: 'repeated-class', stratum: 'unique-label', html: '<main><h1>Inbox</h1><button id="reply-thread" class="button primary">Reply to thread</button><button class="button primary">Help</button></main>', target: '#reply-thread' },
  { id: 'repeated-class-03', category: 'repeated-class', stratum: 'ambiguous-label', html: '<main><h1>Inbox</h1><button class="button primary">Archive</button><button class="button primary">Archive</button></main>', target: 'main > button:nth-of-type(1)' },
  { id: 'repeated-class-04', category: 'repeated-class', stratum: 'unique-label', html: '<section><h2>Thread</h2><button id="forward-thread" class="button primary">Forward message</button><button class="button primary">Close</button></section>', target: '#forward-thread' },
  { id: 'repeated-class-05', category: 'repeated-class', stratum: 'unique-label', html: '<section><h2>Thread</h2><button class="button primary">Move thread</button><button class="button primary">Cancel</button></section>', target: 'section button:nth-of-type(1)' },

  { id: 'repeated-label-01', category: 'repeated-label', stratum: 'ambiguous-label', html: '<main><h1>Profile</h1><button id="profile-save">Save</button><button>Save</button></main>', target: '#profile-save' },
  { id: 'repeated-label-02', category: 'repeated-label', stratum: 'unique-label', html: '<main><h1>Profile</h1><button id="profile-save">Save profile</button><button>Cancel</button></main>', target: '#profile-save' },
  { id: 'repeated-label-03', category: 'repeated-label', stratum: 'ambiguous-label', html: '<main><h1>Settings</h1><button class="action">Save</button><button class="action">Save</button></main>', target: 'main > button:nth-of-type(1)' },
  { id: 'repeated-label-04', category: 'repeated-label', stratum: 'unique-label', html: '<article><h2>Draft</h2><button class="primary-action">Delete draft</button><a>Keep editing</a></article>', target: '.primary-action' },
  { id: 'repeated-label-05', category: 'repeated-label', stratum: 'ambiguous-label', html: '<footer><span>Billing</span><button id="billing-save">Save</button><button>Save</button></footer>', target: '#billing-save' },

  { id: 'safe-test-id-01', category: 'safe-test-id', stratum: 'ambiguous-label', html: '<main><h1>Checkout</h1><button data-testid="checkout-continue">Continue</button><button>Continue</button></main>', target: '[data-testid="checkout-continue"]' },
  { id: 'safe-test-id-02', category: 'safe-test-id', stratum: 'unique-label', html: '<section><h2>Shipping</h2><button data-testid="shipping-continue">Review shipping</button><button>Back</button></section>', target: '[data-testid="shipping-continue"]' },
  { id: 'safe-test-id-03', category: 'safe-test-id', stratum: 'ambiguous-label', html: '<form><legend>Payment</legend><button data-cy="payment-continue">Continue</button><button>Continue</button></form>', target: '[data-cy="payment-continue"]' },
  { id: 'safe-test-id-04', category: 'safe-test-id', stratum: 'unique-label', html: '<aside><h2>Review</h2><button data-testid="review-order">Review order</button><a>Need help?</a></aside>', target: '[data-testid="review-order"]' },
  { id: 'safe-test-id-05', category: 'safe-test-id', stratum: 'unique-label', html: '<main><h1>Confirm</h1><button class="action" data-testid="shared-action">Place order</button><button class="action" data-testid="shared-action">Cancel</button></main>', target: 'main > button:nth-of-type(1)' },
];
