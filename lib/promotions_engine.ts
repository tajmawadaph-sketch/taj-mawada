export type PromotionType = 
  | 'BOGO' 
  | 'THRESHOLD' 
  | 'CROSS_SELLING' 
  | 'TIERED' 
  | 'QUANTITY' 
  | 'BUNDLE' 
  | 'PARTNER_TIER';

export interface Promotion {
  id: string;
  name: string;
  description?: string;
  type: PromotionType;
  status: 'active' | 'inactive' | 'scheduled' | 'expired';
  start_date: string | null;
  end_date: string | null;
  conditions: any; // JSONB
  rewards: any; // JSONB
  priority: number;
}

export interface PosCartItem {
  id: string;
  name?: string;
  qty: number;
  unit_price: number;
  discount?: number;
  promo_discount?: number;
  promo_badge?: string;
  applied_promotions?: string[];
  free_gift_qty?: number;
  total?: number;
  [key: string]: any;
}

/**
 * Distributes a manual discount equally across all cart items.
 * @param cart The current cart items
 * @param manualDiscountAmount The total amount of discount to apply
 * @param discountType 'amount' or 'percentage'
 * @returns An updated cart with `discount` and `net_total` fields updated for each item
 */
export function distributeManualDiscount(
  cart: PosCartItem[], 
  manualDiscountAmount: number, 
  discountType: 'amount' | 'percentage'
): PosCartItem[] {
  if (!cart || cart.length === 0 || manualDiscountAmount <= 0) return cart;

  // Calculate gross total of the cart before any discounts
  const grossTotal = cart.reduce((sum, item) => sum + (item.unit_price * item.qty), 0);
  if (grossTotal === 0) return cart;

  // Determine the absolute total discount amount
  let totalDiscountAmount = 0;
  if (discountType === 'percentage') {
    totalDiscountAmount = grossTotal * (manualDiscountAmount / 100);
  } else {
    totalDiscountAmount = manualDiscountAmount;
  }

  // Prevent discounting more than the cart total
  if (totalDiscountAmount > grossTotal) {
    totalDiscountAmount = grossTotal;
  }

  // Calculate proportional discount for each item
  let remainingDiscount = totalDiscountAmount;
  
  return cart.map((item, index) => {
    const itemGross = item.unit_price * item.qty;
    
    let itemDiscount = 0;
    
    // If it's the last item, assign all remaining discount to handle rounding errors
    if (index === cart.length - 1) {
      itemDiscount = Number(remainingDiscount.toFixed(2));
    } else {
      // Proportional discount based on item's share of gross total
      const proportion = itemGross / grossTotal;
      itemDiscount = Number((totalDiscountAmount * proportion).toFixed(2));
      remainingDiscount -= itemDiscount;
    }

    // Ensure we don't discount more than the item's remaining gross value after promo_discount
    const promoDiscount = item.promo_discount || 0;
    const maxAllowedDiscount = Math.max(0, itemGross - promoDiscount);
    if (itemDiscount > maxAllowedDiscount) {
        itemDiscount = maxAllowedDiscount;
    }

    const totalDiscount = itemDiscount + promoDiscount;
    const net_total = Math.max(0, itemGross - totalDiscount);

    return {
      ...item,
      discount: itemDiscount,
      total: Number(net_total.toFixed(2))
    };
  });
}

/**
 * Applies active promotions to the cart with support for:
 * 1. BOGO (اشترِ X واحصل على Y مجاناً أو بخصم)
 * 2. QUANTITY / TIERED (خصم نسبة أو مبلغ عند تجاوز حد معين من الكمية)
 * 3. PARTNER_TIER (خصومات فئات الشركاء لمربي الخيل والإبل والعيادات البيطرية)
 * 4. THRESHOLD (خصم عند بلوغ حد معين من إجمالي السلة)
 */
export function applyPromotions(
  cart: PosCartItem[], 
  promotions: Promotion[], 
  selectedCustomer?: any
): PosCartItem[] {
    const now = new Date();
    const activePromos = (promotions || []).filter(p => {
        if (p.status !== 'active') return false;
        if (p.start_date && new Date(p.start_date) > now) return false;
        if (p.end_date && new Date(p.end_date) < now) return false;
        return true;
    }).sort((a, b) => (b.priority || 0) - (a.priority || 0));

    let updatedCart = [...cart].map(item => ({
        ...item, 
        promo_discount: 0,
        free_gift_qty: 0,
        applied_promotions: [] as string[],
        promo_badge: ''
    }));

    for (const promo of activePromos) {
        // ====================================================================
        // 1. 🎁 عروض BOGO (Buy X Get Y Free / Discounted)
        // ====================================================================
        if (promo.type === 'BOGO') {
            const buyItemId = promo.conditions?.buy_item_id;
            const getItemId = promo.rewards?.get_item_id || buyItemId;
            const buyQty = Number(promo.conditions?.buy_qty) || 1;
            const getQty = Number(promo.rewards?.get_qty) || 1;
            const discountPercent = Number(promo.rewards?.discount_percentage ?? 100);

            const buyItemIndex = updatedCart.findIndex(i => i.id === buyItemId);
            if (buyItemIndex > -1) {
                const buyItem = updatedCart[buyItemIndex];

                if (!getItemId || getItemId === buyItemId) {
                    // Same item BOGO (e.g. Buy 3 Get 1 Free => set of 4, or buy 3 qualify for 1)
                    const setSize = buyQty + getQty;
                    const eligibleSets = Math.floor(buyItem.qty / setSize);
                    
                    if (eligibleSets > 0) {
                        const discountedCount = eligibleSets * getQty;
                        const lineGross = buyItem.unit_price * buyItem.qty;
                        const availableDiscountHeadroom = Math.max(0, lineGross - (buyItem.promo_discount || 0));
                        const discountAmount = Math.min(
                            availableDiscountHeadroom, 
                            discountedCount * buyItem.unit_price * (discountPercent / 100)
                        );
                        
                        const badgeText = discountPercent >= 100 
                            ? `🎁 هدية مجانية (+${discountedCount})` 
                            : `🏷️ خصم ${discountPercent}% على (+${discountedCount})`;

                        updatedCart[buyItemIndex] = {
                            ...buyItem,
                            promo_discount: Number(((buyItem.promo_discount || 0) + discountAmount).toFixed(2)),
                            free_gift_qty: (buyItem.free_gift_qty || 0) + (discountPercent >= 100 ? discountedCount : 0),
                            promo_badge: badgeText,
                            applied_promotions: [...(buyItem.applied_promotions || []), promo.name]
                        };
                    }
                } else {
                    // Cross-item BOGO (e.g. Buy Item A Get Item B Free)
                    const eligibleSets = Math.floor(buyItem.qty / buyQty);
                    const getItemIndex = updatedCart.findIndex(i => i.id === getItemId);
                    
                    if (eligibleSets > 0 && getItemIndex > -1) {
                        const getItem = updatedCart[getItemIndex];
                        const freeQtyEligible = eligibleSets * getQty;
                        const discountedCount = Math.min(getItem.qty, freeQtyEligible);
                        const lineGross = getItem.unit_price * getItem.qty;
                        const availableDiscountHeadroom = Math.max(0, lineGross - (getItem.promo_discount || 0));
                        const discountAmount = Math.min(
                            availableDiscountHeadroom,
                            discountedCount * getItem.unit_price * (discountPercent / 100)
                        );

                        const badgeText = discountPercent >= 100 
                            ? `🎁 هدية عرض مع (${buyItem.name || 'الصنف'}) (+${discountedCount})` 
                            : `🏷️ خصم عرض ${discountPercent}% (+${discountedCount})`;

                        updatedCart[getItemIndex] = {
                            ...getItem,
                            promo_discount: Number(((getItem.promo_discount || 0) + discountAmount).toFixed(2)),
                            free_gift_qty: (getItem.free_gift_qty || 0) + (discountPercent >= 100 ? discountedCount : 0),
                            promo_badge: badgeText,
                            applied_promotions: [...(getItem.applied_promotions || []), promo.name]
                        };
                    }
                }
            }
        }
        
        // ====================================================================
        // 2. 📦 عروض خصم الكميات الشرائحية (TIERED / QUANTITY)
        // ====================================================================
        else if (promo.type === 'TIERED' || promo.type === 'QUANTITY') {
            const targetItemId = promo.conditions?.item_id || promo.conditions?.buy_item_id;
            const targetItemIds = Array.isArray(promo.conditions?.item_ids) ? promo.conditions.item_ids : [];
            const minQty = Number(promo.conditions?.min_qty || promo.conditions?.quantity || 1);
            const discountPct = Number(promo.rewards?.discount_percentage || 0);
            const discountAmountPerUnit = Number(promo.rewards?.discount_amount || 0);

            updatedCart = updatedCart.map(item => {
                const isTarget = (!targetItemId && targetItemIds.length === 0) || 
                                 (targetItemId && item.id === targetItemId) || 
                                 (targetItemIds.length > 0 && targetItemIds.includes(item.id));

                if (isTarget && item.qty >= minQty) {
                    const lineGross = item.unit_price * item.qty;
                    const availableDiscountHeadroom = Math.max(0, lineGross - (item.promo_discount || 0));

                    let discountToAdd = 0;
                    if (discountPct > 0) {
                        discountToAdd = lineGross * (discountPct / 100);
                    } else if (discountAmountPerUnit > 0) {
                        discountToAdd = discountAmountPerUnit * item.qty;
                    }

                    discountToAdd = Math.min(availableDiscountHeadroom, discountToAdd);

                    if (discountToAdd > 0) {
                        const badgeText = discountPct > 0 
                            ? `🏷️ خصم كمية (${discountPct}%)` 
                            : `🏷️ خصم كمية (${discountAmountPerUnit} ر.س/حبة)`;

                        return {
                            ...item,
                            promo_discount: Number(((item.promo_discount || 0) + discountToAdd).toFixed(2)),
                            promo_badge: item.promo_badge ? `${item.promo_badge} + ${badgeText}` : badgeText,
                            applied_promotions: [...(item.applied_promotions || []), promo.name]
                        };
                    }
                }
                return item;
            });
        }

        // ====================================================================
        // 3. 🐎 خصومات فئات الشركاء (PARTNER_TIER: مربي خيل، إبل، عيادات بيطرية)
        // ====================================================================
        else if (promo.type === 'PARTNER_TIER') {
            if (selectedCustomer) {
                const targetCategories = Array.isArray(promo.conditions?.categories) 
                    ? promo.conditions.categories 
                    : (promo.conditions?.category ? [promo.conditions.category] : []);
                
                const targetPartnerIds = Array.isArray(promo.conditions?.partner_ids) 
                    ? promo.conditions.partner_ids 
                    : (promo.conditions?.partner_id ? [promo.conditions.partner_id] : []);

                const customerType = String(selectedCustomer.job_role || selectedCustomer.category || selectedCustomer.partner_type || selectedCustomer.customer_tier || '').trim();
                const customerId = String(selectedCustomer.id || '');

                const categoryMatched = targetCategories.length > 0 && targetCategories.some((cat: string) => 
                    customerType.toLowerCase().includes(cat.toLowerCase()) || 
                    String(selectedCustomer.name || '').toLowerCase().includes(cat.toLowerCase())
                );

                const partnerIdMatched = targetPartnerIds.length > 0 && targetPartnerIds.includes(customerId);

                if (categoryMatched || partnerIdMatched) {
                    const discountPct = Number(promo.rewards?.discount_percentage || 0);
                    const specificItemIds = Array.isArray(promo.conditions?.item_ids) ? promo.conditions.item_ids : [];

                    if (discountPct > 0) {
                        updatedCart = updatedCart.map(item => {
                            const isEligible = specificItemIds.length === 0 || specificItemIds.includes(item.id);
                            if (isEligible) {
                                const lineGross = item.unit_price * item.qty;
                                const availableDiscountHeadroom = Math.max(0, lineGross - (item.promo_discount || 0));
                                const discountToAdd = Math.min(availableDiscountHeadroom, lineGross * (discountPct / 100));

                                if (discountToAdd > 0) {
                                    const icon = customerType.includes('خيل') ? '🐎' : customerType.includes('إبل') ? '🐫' : customerType.includes('عياد') ? '🏥' : '👑';
                                    const badgeText = `${icon} خصم الشريك (${discountPct}%)`;

                                    return {
                                        ...item,
                                        promo_discount: Number(((item.promo_discount || 0) + discountToAdd).toFixed(2)),
                                        promo_badge: item.promo_badge ? `${item.promo_badge} + ${badgeText}` : badgeText,
                                        applied_promotions: [...(item.applied_promotions || []), promo.name]
                                    };
                                }
                            }
                            return item;
                        });
                    }
                }
            }
        }

        // ====================================================================
        // 4. 🛒 عروض الحد الأدنى لقيمة الفاتورة (THRESHOLD)
        // ====================================================================
        else if (promo.type === 'THRESHOLD') {
            const threshold = Number(promo.conditions?.min_cart_value) || 0;
            const discountAmt = Number(promo.rewards?.discount_amount) || 0;
            const discountPct = Number(promo.rewards?.discount_percentage) || 0;

            const cartGross = updatedCart.reduce((sum, item) => sum + (item.unit_price * item.qty), 0);
            
            if (cartGross >= threshold && cartGross > 0) {
                const totalDiscount = discountAmt > 0 ? discountAmt : (cartGross * (discountPct / 100));
                const cappedDiscount = Math.min(cartGross, totalDiscount);

                updatedCart = updatedCart.map(item => {
                    const itemGross = item.unit_price * item.qty;
                    const proportion = itemGross / cartGross;
                    const itemShare = Number((cappedDiscount * proportion).toFixed(2));
                    const availableDiscountHeadroom = Math.max(0, itemGross - (item.promo_discount || 0));
                    const finalShare = Math.min(availableDiscountHeadroom, itemShare);

                    return {
                        ...item,
                        promo_discount: Number(((item.promo_discount || 0) + finalShare).toFixed(2)),
                        applied_promotions: [...(item.applied_promotions || []), promo.name]
                    };
                });
            }
        }
    }

    return updatedCart.map(item => {
        const itemGross = item.unit_price * item.qty;
        const totalDiscount = (item.discount || 0) + (item.promo_discount || 0);
        return {
            ...item,
            total: Math.max(0, Number((itemGross - totalDiscount).toFixed(2)))
        };
    });
}

