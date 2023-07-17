const path = require('path');

const express = require('express');

const shopController = require('../controllers/shops');
const isAuth = require('../middleware/is-auth');

const router = express.Router();

router.get('/', shopController.getIndex);

router.get('/products', shopController.getProducts);

router.get('/products/:productId', shopController.getProduct);

router.get('/cart', isAuth, shopController.getCart);

router.post('/cart', isAuth, shopController.postCart);

router.post('/cart-delete-item', isAuth, shopController.postCartDeleteProduct);

// router.post('/create-order', isAuth, shopController.postOrder);

router.get('/checkout', isAuth, shopController.getCheckout);

router.get('/checkout/success', isAuth, shopController.postOrder);

router.get('/checkout/cancel', isAuth, shopController.getCheckout);

router.get('/orders', isAuth, shopController.getOrders);

router.get('/orders/:orderId',isAuth,shopController.getInvoice)

router.get('/getTotal', isAuth, shopController.getTotal);

router.get('/wishlist', isAuth, shopController.getWishlist);

router.get('/wishlist/:ownerId', isAuth, shopController.getIndividualWishlist);

router.post('/wishlist-add', isAuth, shopController.addToWishlist);

router.post('/wishlist-delete', isAuth, shopController.removeFromWishlist);

router.post('/gift',isAuth, shopController.postGift);

router.get('/gift-success/:userId/:productId', isAuth, shopController.postGiftComplete);
// gift-success
module.exports = router;
