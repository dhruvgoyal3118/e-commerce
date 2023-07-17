const fs = require("fs");
const path = require("path");
const Product = require("../models/product");
const Order = require("../models/order");
const User = require("../models/user");
const PDFDocument = require('pdfkit');
const stripe = require('stripe')('sk_test_51NPk7cSCQ0RheH059SMkYhbgoHUz07jqCjdsamNZHxOK588TI8LQsuxvM8nwhMeDyNPfvmsLFnLuh6bfUcX4rSBV00QmKTHEaB');

const ITEMS_PER_PAGE =2;

exports.getProducts = (req, res, next) => {
  Product.find()
    .then((products) => {
      console.log(products);
      res.render("shop/product-list", {
        prods: products,
        pageTitle: "All Products",
        path: "/products",
      });
    })
    .catch((err) => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};

exports.getProduct = (req, res, next) => {
  const prodId = req.params.productId;
  Product.findById(prodId)
    .then((product) => {
      if(!product)
      {
        throw new Error('Product not found');
      }
      res.render("shop/product-detail", {
        product: product,
        pageTitle: product.title,
        path: "/products",
      });
    })
    .catch((err) => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};

exports.getIndex = (req, res, next) => {
  const page = req.query.page||1;
  let totalItems = 0;
  let message = req.flash('total-message')||null;
  if (message.length > 0) {
    message = message[0];
  } else {
    message = null;
  }
 Product.find().count().then(numProducts => {
    totalItems = numProducts;
    return Product.find()
    .skip((page-1)*ITEMS_PER_PAGE)
  .limit(ITEMS_PER_PAGE)
 })
    .then((products) => {
      res.render("shop/index", {
        prods: products,
        pageTitle: "Shop",
        path: "/",
        currentPage: page,
        hasNextPage:ITEMS_PER_PAGE*page<totalItems,
        hasPreviousPage:page>1,
        nextPage:+page+1,
        previousPage:+page-1,
        lastPage : Math.ceil(totalItems/ITEMS_PER_PAGE),
        totalMessage: message
      });
    })
    .catch((err) => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};

exports.getCart = (req, res, next) => {
  console.log('get Cart fot called');
  req.user
    .populate("cart.items.productId")
    .execPopulate()
    .then((user) => {
      const products = user.cart.items;
      console.log(products); 
      res.render("shop/cart", {
        path: "/cart",
        pageTitle: "Your Cart",
        products: products,
      });
    })
    .catch((err) => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};

exports.postCart = (req, res, next) => {
  const prodId = req.body.productId;
  Product.findById(prodId)
    .then((product) => {
      return req.user.addToCart(product);
    })
    .then((result) => {
      console.log(result);
      res.redirect("/cart");
    })
    .catch((err) => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};

exports.postCartDeleteProduct = (req, res, next) => {
  const prodId = req.body.productId;
  req.user
    .removeFromCart(prodId)
    .then((result) => {
      res.redirect("/cart");
    })
    .catch((err) => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};

exports.getCheckout = (req, res, next) => {
  let products,total=0;
  req.user
  .populate("cart.items.productId")
  .execPopulate()
  .then((user) => {
     products = user.cart.items;

    products.forEach((i) => {
          total+=i.quantity*i.productId.price;
        });
    console.log(products); 
    return stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: products.map(p=>{
        return {
          price_data: {
            currency: 'usd',
            product_data: {
              name: p.productId.title,
              description: p.productId.description,
            },
            unit_amount: p.productId.price * 100,
          },
          quantity: p.quantity,
        };
      }),
      customer_email: req.user.email,

      success_url:`${req.protocol}://${req.get('host')}/checkout/success`,
      cancel_url: `${req.protocol}://${req.get('host')}/checkout/cancel`
    });
    }).then((session)=>{
      // res.redirect(303, session.url);
        res.render("shop/checkout", {
          path: "/checkout",
          pageTitle: "Checkout",
          products: products,
          totalSum: total,
          sessionId: session.id
        });
      })
  .catch((err) => {
    const error = new Error(err);
    console.log(error);
    error.httpStatusCode = 500;
    return next(error);
  });
};

exports.postOrder = (req, res, next) => {
  req.user
    .populate("cart.items.productId")
    .execPopulate()
    .then((user) => {
      const products = user.cart.items.map((i) => {
        return { quantity: i.quantity, product: { ...i.productId._doc } };
      });
      const order = new Order({
        user: {
          email: req.user.email,
          userId: req.user,
        },
        products: products,
      });
      return order.save();
    })
    .then((result) => {
      return req.user.clearCart();
    })
    .then(() => {
      res.redirect("/orders");
    })
    .catch((err) => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};

exports.getOrders = (req, res, next) => {
  Order.find({ "user.userId": req.user._id })
    .then((orders) => {
      res.render("shop/orders", {
        path: "/orders",
        pageTitle: "Your Orders",
        orders: orders,
      });
    })
    .catch((err) => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};

exports.getInvoice = (req, res, next) => {
  const orderId = req.params.orderId;
  Order.findById(orderId)
    .then((order) => {
      if (!order) {
        const error = new Error("Order not found");
        return next(error);
      }
      if (order.user.userId.toString() !== req.user._id.toString()) {
        const error = new Error("Not authorized");
        return next(error);
      }

      const invoiceName = `invoice-${orderId}.pdf`;
      const invoicePath = path.join("data", "invoices", invoiceName);
      const pdfDoc = new PDFDocument()
      res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          'inline; filename="' + invoiceName + ' " '
        );
      pdfDoc.pipe(fs.createWriteStream(invoicePath));
      pdfDoc.pipe(res);

      pdfDoc. fontSize(26).text('Invoice',{
        underline: true,
      });
      pdfDoc.fontSize(26).text('------------------------------------------------------');
      let total_price =0;
      order.products.forEach(prod => {
        total_price += prod.product.price * prod.quantity;
        pdfDoc.fontSize(16).text(
          prod.product.title+
          '-'+
          prod.quantity+
          ' x $'+
          prod.product.price);
          
        });
        pdfDoc.fontSize(26).text('------------------------------------------------------');
      pdfDoc.fontSize(20).text('Total: $'+total_price,{underline:true});
      pdfDoc.end();

      //were used to read existing pdfs  createReadStream is better for large Files as it 
      // doesn't need server to preprocess the files

      // fs.readFile(invoicePath, (err, data) => {
      //   if (err) {
      //     console.log(err);
      //     return next(err);
      //   }
      //   res.setHeader("Content-Type", "application/pdf");
      //   res.setHeader(
      //     "Content-Disposition",
      //     'attachment; filename="' + invoiceName + ' " '
      //   );
      //   res.send(data);
      //   res.end();
      // });

      // const file = fs.createReadStream(invoicePath);
      // res.setHeader("Content-Type", "application/pdf");
      //   res.setHeader(
      //     "Content-Disposition",
      //     'inline; filename="' + invoiceName + ' " '
      //   );
      //   file.pipe(res);
      

    })
    .catch((err) => {
      console.log(err);
      next(err);
    });
};

exports.getTotal = async (req,res,next) => {
  const user = req.user;
  console.log(user);
  let totalSpent = 0;
  const orders = await Order.find({'user.email': user.email});
  console.log('boom!');
  // console.log(orders);
  orders.forEach((order) => {
    order.products.forEach((orderItem) => {
      let qty=orderItem.quantity;
      let price = orderItem.product.price;
      totalSpent += qty * price;
      console.log('temp spent is '+totalSpent);
    })
  })
  // console.log('total spent is '+totalSpent);
  let message = `Your Have Purchased Products worth $${totalSpent} so far. Happy Shopping!`;
  req.flash('total-message', message);
  return res.redirect('/');
};

exports.getWishlist = async(req,res,next) => {
  try{
  const users = await User.find();
  return  res.render('shop/wishlist',{
        path: "/wishlist",
        pageTitle: "WishList",
        users: users,
  })}catch(err){
    const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
  }
};

exports.getIndividualWishlist = async(req,res,next) => {
  try{
    console.log('individual wishlist')
    const ownerId = req.params.ownerId;
    const user  = req.user;
    let hasControl = user._id.toString()===ownerId.toString()?true:false;
    console.log(hasControl);
    let owner   = await User.findById(ownerId);
    if(!owner){
      const error = new Error('Owner not found');
      throw error;
    }
    owner= await owner.populate('wishlist.items.productId').execPopulate();
    console.log(owner.wishlist.items.length);
    console.log('fine');
    return res.render('shop/wish',{
        wishlist: owner.wishlist.items,
        pageTitle: 'WishList',
        path: "/wishlist",
        hasControl: hasControl,
        ownerId:ownerId.toString(),
        userId:user._id.toString(),
    })
  }catch(err){
    console.log(err);
    const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
  }

  
};

exports.addToWishlist = async (req,res,next)=>{
  console.log('wishlist adder called');
    const prodId = req.body.productId;
    const user = req.user;
    const product = await Product.findById(prodId);
    // const wishlistIndex = user.wishlist.items.findIndex(item=>{
    //   return item.productId.toString()===prodId.toString();
    // });
    // console.log(wishlistIndex);
    // if(wishlistIndex>-1)
    // return res.redirect(`/wishlist/${user._id}`);
    await user.addToWishlist(product);
    return res.redirect(`/wishlist/${user._id}`);
    
}

exports.removeFromWishlist = async (req,res,next)=>{
  const prodId = req.body.productId;
  const user = req.user;
  await user.removeFromWishlist(prodId);
  return res.redirect(`/wishlist/${user._id}`)
};



exports.postGift = async (req, res,next)=>{
  try{
  const ownerId=  req.body.ownerId;
  // const userId =  req.body.userId;
  const prodId  = req.body.productId;
  // const user = await User.findById(userId);
  // const owner = await User.findById(ownerId);
  const product   = await Product.findById(prodId);
  let products=[],total=product.price;

  console.log('Before gift renders 2')
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    mode: "payment",
    line_items:[{
      price_data:{
        currency: 'usd',
        product_data: {
          name: product.title,
          description:product.description,
        },
        unit_amount: product.price * 100,
      },
      quantity: 1
    }],
      success_url:`${req.protocol}://${req.get('host')}/gift-success/${ownerId}/${prodId}`,
      cancel_url: `${req.protocol}://${req.get('host')}/wishlist`
  });
  console.log('Before gift renders 3');
  products = [product];
  console.log('Before gift renders 4');
  console.log(session.id)
  console.log(product)
  return res.render("shop/checkout-gift", {
    path: "/checkout",
    pageTitle: "Checkout",
    product: product,
    totalSum: total,
    sessionId: session.id
  });
}catch(err){
  
  console.log(err);
  const error = new Error(err);
    error.httpStatusCode = 500;
    return next(error);
}
  
}

exports.postGiftComplete = async (req, res, next)=>{
  try{
    const userId = req.params.userId;
    const productId = req.params.productId;
    console.log('userId: ' + userId + ' productId: ' + productId);
    const user = await User.findById(userId);
    const product = await Product.findById(productId);
    // req.user
    // .populate("cart.items.productId")
    // .execPopulate()
    // .then((user) => {
    //   const products = user.cart.items.map((i) => {
    //     return { quantity: i.quantity, product: { ...i.productId._doc } };
    //   });
    let products =[{quantity:1,product: {...product}}]; 

    const order = new Order({
      user: {
        email: user.email,
        userId: user._id,
      },
      products: products,
    });
    console.log('order is ');
    console.log(order);
    console.log(order.products[0]);
    await order.save();
    let message = 'Thanks a Lot For Gifting and spreading happiness';
    req.flash('total-message',message);
    return res.redirect("/");
  }catch(err){
    const error = new Error(err);
    error.httpStatusCode = 500;
    return next(error);
  }
};