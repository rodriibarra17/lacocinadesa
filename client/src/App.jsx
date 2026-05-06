import React, { useEffect, useState } from "react";
import { brand, defaultProducts, defaultRecipes, defaultSiteContent } from "./content";
import supabase from "./supabase";
import { isStorageConfigured, uploadImageToStorage } from "./supabaseStorage";

const ADMIN_USER = "Sabri";
const ADMIN_PASSWORD = "Copito2026";
const RECIPES_KEY = "sa_recipes";
const CONTENT_KEY = "sa_site_content";
const BRAND_KEY = "sa_brand_settings";
const ADMIN_KEY = "sa_admin_logged";
const predefinedCategories = [
  "Tortas",
  "Budines",
  "Cookies",
  "Salado",
  "Otros"
];

function App() {
  const [route, setRoute] = useState(window.location.pathname);
  const [products, setProducts] = useState(() => normalizeProducts(defaultProducts));
  const [recipes, setRecipes] = useState(() => normalizeRecipes(loadStored(RECIPES_KEY, defaultRecipes)));
  const [siteContent, setSiteContent] = useState(() => ({ ...defaultSiteContent, ...loadStoredObject(CONTENT_KEY) }));
  const [brandSettings, setBrandSettings] = useState(() => ({ ...brand, ...loadStoredObject(BRAND_KEY) }));
  const [cart, setCart] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [toast, setToast] = useState("");
  const [productStatus, setProductStatus] = useState("Cargando productos desde Supabase...");
  const [isAdminLogged, setIsAdminLogged] = useState(localStorage.getItem(ADMIN_KEY) === "true");

  useEffect(() => {
    document.title = "La cocina de Sa";
    const favicon = document.querySelector("link[rel='icon']");
    if (favicon) {
      favicon.setAttribute("href", "/images/logo.png");
      favicon.setAttribute("type", "image/png");
    }
    window.onpopstate = () => setRoute(window.location.pathname);
    return () => {
      window.onpopstate = null;
    };
  }, []);

  useEffect(() => {
    function handleHiddenAdminShortcut(event) {
      if (event.ctrlKey && event.altKey && event.key.toLowerCase() === "a") {
        event.preventDefault();
        navigate("/admin");
      }
    }

    window.addEventListener("keydown", handleHiddenAdminShortcut);
    return () => window.removeEventListener("keydown", handleHiddenAdminShortcut);
  }, []);

  useEffect(() => {
    fetchProducts();
  }, []);
  useEffect(() => localStorage.setItem(RECIPES_KEY, JSON.stringify(recipes)), [recipes]);
  useEffect(() => localStorage.setItem(CONTENT_KEY, JSON.stringify(siteContent)), [siteContent]);
  useEffect(() => localStorage.setItem(BRAND_KEY, JSON.stringify(brandSettings)), [brandSettings]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function navigate(path) {
    window.history.pushState({}, "", path);
    window.dispatchEvent(new Event("popstate"));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function addToCart(product) {
    setCart((current) => {
      const existing = current.find((item) => item.id === product.id);
      if (existing) {
        return current.map((item) => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...current, { ...product, quantity: 1 }];
    });
    setToast("Producto agregado al carrito");
  }

  function updateQuantity(id, delta) {
    setCart((current) => current
      .map((item) => item.id === id ? { ...item, quantity: item.quantity + delta } : item)
      .filter((item) => item.quantity > 0));
  }

  function removeFromCart(id) {
    setCart((current) => current.filter((item) => item.id !== id));
  }

  async function fetchProducts() {
    try {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      const nextProducts = normalizeProducts((data || []).map(mapSupabaseProduct));
      setProducts(nextProducts.length ? nextProducts : defaultProducts);
      setProductStatus(nextProducts.length ? "Productos sincronizados con Supabase." : "No hay productos en Supabase. Se muestran productos de ejemplo.");
    } catch (error) {
      console.error("SUPABASE ERROR:", error);
      setProductStatus(`No se pudieron cargar productos desde Supabase: ${error.message}`);
      setProducts(defaultProducts);
    }
  }

  async function saveProduct(product, editingProductId) {
    try {
      const payload = productToSupabase(product);
      let response;

      if (editingProductId) {
        response = await supabase
          .from("products")
          .update(payload)
          .eq("id", editingProductId)
          .select()
          .single();
      } else {
        response = await supabase
          .from("products")
          .insert([payload])
          .select()
          .single();
      }

      if (response.error && payload.favorite !== undefined) {
        const fallbackPayload = productToSupabase(product, false);
        response = editingProductId
          ? await supabase.from("products").update(fallbackPayload).eq("id", editingProductId).select().single()
          : await supabase.from("products").insert([fallbackPayload]).select().single();
      }

      if (response.error) throw response.error;

      const savedProduct = normalizeProducts([mapSupabaseProduct(response.data)])[0];
      setProducts((current) => editingProductId
        ? current.map((item) => item.id === editingProductId ? savedProduct : item)
        : [savedProduct, ...current.filter((item) => item.id !== savedProduct.id && !String(item.id).startsWith("product-"))]);
      setProductStatus("Producto guardado en Supabase.");
      return true;
    } catch (error) {
      console.error("SUPABASE ERROR:", error);
      setProductStatus(`No se pudo guardar el producto: ${error.message}`);
      return false;
    }
  }

  async function deleteProduct(id) {
    try {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
      setProducts((current) => current.filter((product) => product.id !== id));
      setProductStatus("Producto eliminado de Supabase.");
    } catch (error) {
      console.error("SUPABASE ERROR:", error);
      setProductStatus(`No se pudo eliminar el producto: ${error.message}`);
    }
  }

  async function toggleFavorite(id) {
    const product = products.find((item) => item.id === id);
    if (!product) return;

    const nextFavorite = !product.favorite;
    setProducts((current) => current.map((item) => item.id === id ? { ...item, favorite: nextFavorite } : item));

    const { error } = await supabase.from("products").update({ favorite: nextFavorite }).eq("id", id);
    if (error) {
      console.error("SUPABASE ERROR:", error);
      setProducts((current) => current.map((item) => item.id === id ? { ...item, favorite: product.favorite } : item));
      setProductStatus("La tabla products no tiene columna favorite o no se pudo actualizar.");
      return;
    }
    setProductStatus("Favorito actualizado en Supabase.");
  }

  if (route === "/admin") {
    return (
      <HiddenAdmin
        isLogged={isAdminLogged}
        setIsLogged={setIsAdminLogged}
        navigate={navigate}
        products={products}
        productStatus={productStatus}
        onSaveProduct={saveProduct}
        onDeleteProduct={deleteProduct}
        onToggleFavorite={toggleFavorite}
        recipes={recipes}
        setRecipes={setRecipes}
        siteContent={siteContent}
        setSiteContent={setSiteContent}
        brandSettings={brandSettings}
        setBrandSettings={setBrandSettings}
      />
    );
  }

  const favoriteProducts = products.filter((product) => product.favorite).slice(0, 3);
  const productCategories = getProductCategories(products);
  const routeCategory = getCategoryFromPath(route);
  const selectedCategory = routeCategory || "Todos";
  const visibleProducts = !routeCategory
    ? products
    : products.filter((product) => product.category === routeCategory);
  const productsTitle = routeCategory ? routeCategory : "Productos";

  return (
    <>
      <Navbar
        navigate={navigate}
        categories={productCategories}
        selectedCategory={selectedCategory}
        cartCount={cart.reduce((sum, item) => sum + item.quantity, 0)}
      />
      <main>
        <Hero content={siteContent} />
        <Featured products={favoriteProducts.length ? favoriteProducts : products.slice(0, 3)} onAdd={addToCart} onSelect={setSelectedProduct} content={siteContent} />
        <About content={siteContent} />
        <ProductsCarousel
          products={visibleProducts}
          onAdd={addToCart}
          onSelect={setSelectedProduct}
          content={{ ...siteContent, productsTitle, productsEyebrow: "Pasteleria artesanal" }}
        />
        <Recipes recipes={recipes} content={siteContent} onSelect={setSelectedRecipe} />
        <SocialSection content={siteContent} brandSettings={brandSettings} />
        <Cart cart={cart} updateQuantity={updateQuantity} removeFromCart={removeFromCart} brandSettings={brandSettings} />
      </main>
      <Footer content={siteContent} brandSettings={brandSettings} />
      <Credits />
      <FloatingOrder cart={cart} brandSettings={brandSettings} />
      {toast && <Toast message={toast} />}
      {selectedProduct && (
        <ProductModal product={selectedProduct} onClose={() => setSelectedProduct(null)} onAdd={addToCart} />
      )}
      {selectedRecipe && (
        <RecipeModal recipe={selectedRecipe} onClose={() => setSelectedRecipe(null)} />
      )}
    </>
  );
}

function Logo({ footer = false }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return <span className={footer ? "logo-fallback footer-logo" : "logo-fallback"}>La cocina de Sa</span>;
  }

  return (
    <img
      className={footer ? "logo footer-logo" : "logo"}
      src="/images/logo.png"
      alt="La cocina de Sa"
      onError={() => setFailed(true)}
    />
  );
}

function Navbar({ navigate, categories, selectedCategory, cartCount }) {
  const [logoClicks, setLogoClicks] = useState(0);
  const visibleCategories = categories.slice(0, 5);
  const hiddenCategories = categories.slice(5);
  const isMoreActive = hiddenCategories.includes(selectedCategory);

  function handleBrandClick() {
    setLogoClicks((current) => {
      const next = current + 1;
      if (next >= 5) {
        navigate("/admin");
        return 0;
      }
      window.setTimeout(() => setLogoClicks(0), 1200);
      navigate("/");
      return next;
    });
  }

  return (
    <header className="navbar">
      <button className="brand-button" onClick={handleBrandClick}>
        <Logo />
        <span className="brand-stack">
          <small>La cocina de Sa</small>
        </span>
      </button>
      <nav>
        <button className={selectedCategory === "Todos" ? "nav-active" : ""} onClick={() => navigate("/")} type="button">Home</button>
        {visibleCategories.map((category) => (
          <button
            key={category}
            className={selectedCategory === category ? "nav-active" : ""}
            onClick={() => navigate(`/${categoryToSlug(category)}`)}
            type="button"
          >
            {category}
          </button>
        ))}
        {hiddenCategories.length > 0 && (
          <details className={isMoreActive ? "more-menu nav-active" : "more-menu"}>
            <summary>Mas</summary>
            <div>
              {hiddenCategories.map((category) => (
                <button
                  key={category}
                  className={selectedCategory === category ? "nav-active" : ""}
                  onClick={() => navigate(`/${categoryToSlug(category)}`)}
                  type="button"
                >
                  {category}
                </button>
              ))}
            </div>
          </details>
        )}
        <a href="#redes">Redes</a>
      </nav>
      <a className="cart-pill" href="#pedido">Carrito {cartCount > 0 ? `(${cartCount})` : ""}</a>
    </header>
  );
}

function Hero({ content }) {
  return (
    <section id="home" className="hero">
      <img src="https://images.unsplash.com/photo-1535141192574-5d4897c12636?auto=format&fit=crop&w=1800&q=88" alt="Torta artesanal decorada" />
      <div className="hero-copy">
        <p className="eyebrow">{content.heroEyebrow}</p>
        <h1>{content.heroTitle}</h1>
        <p>{content.heroText}</p>
        <div className="actions">
          <a className="primary" href="#productos">Ver productos</a>
          <a className="secondary" href="#pedido">Armar pedido</a>
        </div>
      </div>
    </section>
  );
}

function Featured({ products, onAdd, onSelect, content }) {
  return (
    <section className="section featured">
      <SectionTitle eyebrow={content.featuredEyebrow} title={content.featuredTitle} />
      <div className="featured-grid">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} onAdd={onAdd} onSelect={onSelect} />
        ))}
      </div>
    </section>
  );
}

function About({ content }) {
  return (
    <section id="sobre-mi" className="about">
      <div className="about-images">
        <img src="https://images.unsplash.com/photo-1556910103-1c02745aae4d?auto=format&fit=crop&w=900&q=85" alt="Proceso artesanal de pasteleria" />
        <img src="https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?auto=format&fit=crop&w=900&q=85" alt="Ingredientes de pasteleria" />
      </div>
      <div>
        <p className="eyebrow">{content.aboutEyebrow}</p>
        <h2>{content.aboutTitle}</h2>
        <p>{content.aboutText}</p>
      </div>
    </section>
  );
}

function ProductsCarousel({ products, onAdd, onSelect, content }) {
  return (
    <section id="productos" className="section products-section">
      <SectionTitle eyebrow={content.productsEyebrow} title={content.productsTitle} />
      {products.length === 0 ? (
        <p className="empty-cart product-empty">No hay productos en esta categoria.</p>
      ) : (
        <div className="products-grid">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} onAdd={onAdd} onSelect={onSelect} />
          ))}
        </div>
      )}
    </section>
  );
}

function ProductCard({ product, onAdd, onSelect }) {
  return (
    <article className="product-card">
      {product.favorite && <span className="favorite-badge">Favorito</span>}
      <button className="product-image-button" onClick={() => onSelect(product)} aria-label={`Ver ${product.name}`}>
        <img src={product.image_url} alt={product.name} loading="lazy" />
      </button>
      <div className="product-copy">
        <em>{product.category}</em>
        <span>{formatPrice(product.price)}</span>
        <h3>{product.name}</h3>
        <p>{product.description}</p>
        <button className="add-button" onClick={() => onAdd(product)}>Agregar al carrito</button>
      </div>
    </article>
  );
}

function Recipes({ recipes, content, onSelect }) {
  return (
    <section id="recetas" className="section recipes-band">
      <SectionTitle eyebrow={content.recipesEyebrow} title={content.recipesTitle} />
      <div className="recipe-grid">
        {recipes.map((recipe) => (
          <article className="recipe-card" key={recipe.id}>
            <img src={recipe.image_url} alt={recipe.title} loading="lazy" />
            <div>
              <h3>{recipe.title}</h3>
              <p>{recipe.content}</p>
              <button className="recipe-button" onClick={() => onSelect(recipe)}>Ver receta</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function SocialSection({ content, brandSettings }) {
  return (
    <section id="redes" className="social-section">
      <div>
        <p className="eyebrow">{content.socialsEyebrow}</p>
        <h2>{content.socialsTitle}</h2>
        <p>{content.socialsText}</p>
      </div>
      <div className="social-cards">
        <SocialLink href={buildSocialLink("whatsapp", brandSettings.whatsapp)} icon="/images/whatsapp.png" label="WhatsApp" />
        <SocialLink href={buildSocialLink("instagram", brandSettings.instagram)} icon="/images/instagram.png" label="Instagram" />
        <SocialLink href={buildSocialLink("tiktok", brandSettings.tiktok)} icon="/images/tiktok.png" label="TikTok" />
      </div>
    </section>
  );
}

function SocialLink({ href, icon, label }) {
  const [failed, setFailed] = useState(false);
  return (
    <a className="social-link" href={href} target="_blank" rel="noreferrer">
      {failed ? <span>{label.slice(0, 2)}</span> : <img src={icon} alt="" onError={() => setFailed(true)} />}
      <strong>{label}</strong>
    </a>
  );
}

function Cart({ cart, updateQuantity, removeFromCart, brandSettings }) {
  const total = getCartTotal(cart);

  return (
    <section id="pedido" className="cart-section">
      <div className="cart-panel">
        <div className="section-title">
          <p className="eyebrow">Pedido</p>
          <h2>Tu carrito</h2>
        </div>
        {cart.length === 0 ? (
          <p className="empty-cart">Elegi productos del carrusel para armar tu pedido.</p>
        ) : (
          <div className="cart-items">
            {cart.map((item) => (
              <article key={item.id} className="cart-item">
                <img src={item.image_url} alt={item.name} />
                <div>
                  <strong>{item.name}</strong>
                  <span>{formatPrice(item.price)} x {item.quantity}</span>
                </div>
                <div className="quantity-controls">
                  <button onClick={() => updateQuantity(item.id, -1)}>-</button>
                  <span>{item.quantity}</span>
                  <button onClick={() => updateQuantity(item.id, 1)}>+</button>
                </div>
                <button className="remove-item" onClick={() => removeFromCart(item.id)}>Eliminar</button>
              </article>
            ))}
          </div>
        )}
        <div className="cart-total">
          <span>Total</span>
          <strong>{formatPrice(total)}</strong>
        </div>
        <a className="order-button" href={buildWhatsAppLink(cart, brandSettings.whatsapp)} target="_blank" rel="noreferrer">
          Realizar pedido
        </a>
      </div>
    </section>
  );
}

function FloatingOrder({ cart, brandSettings }) {
  return (
    <a className="floating-order" href={buildWhatsAppLink(cart, brandSettings.whatsapp)} target="_blank" rel="noreferrer">
      <img src="/images/whatsapp.png" alt="" />
      <span>Realizar pedido</span>
    </a>
  );
}

function ProductModal({ product, onClose, onAdd }) {
  return (
    <div className="modal" onClick={onClose} role="dialog" aria-modal="true">
      <article onClick={(event) => event.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>Cerrar</button>
        <img src={product.image_url} alt={product.name} />
        <div>
          <span>{formatPrice(product.price)}</span>
          <h2>{product.name}</h2>
          <p>{product.description}</p>
          <button className="primary" onClick={() => { onAdd(product); onClose(); }}>Agregar al carrito</button>
        </div>
      </article>
    </div>
  );
}

function RecipeModal({ recipe, onClose }) {
  const ingredients = normalizeLines(recipe.ingredients, ["Ingredientes a gusto de Sa."]);
  const steps = normalizeLines(recipe.steps, ["Consultar el paso a paso completo al realizar el pedido."]);

  return (
    <div className="modal recipe-modal" onClick={onClose} role="dialog" aria-modal="true">
      <article onClick={(event) => event.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>Cerrar</button>
        <img src={recipe.image_url} alt={recipe.title} />
        <div>
          <h2>{recipe.title}</h2>
          <p>{recipe.content}</p>
          <div className="recipe-detail-grid">
            <section>
              <strong>Ingredientes</strong>
              <ul>{ingredients.map((item) => <li key={item}>{item}</li>)}</ul>
            </section>
            <section>
              <strong>Paso a paso</strong>
              <ol>{steps.map((item) => <li key={item}>{item}</li>)}</ol>
            </section>
          </div>
        </div>
      </article>
    </div>
  );
}

function Toast({ message }) {
  return <div className="toast">{message}</div>;
}

function Footer({ content, brandSettings }) {
  const year = new Date().getFullYear();

  return (
    <footer className="footer">
      <div className="footer-brand">
        <Logo footer />
        <strong>La cocina de Sa</strong>
        <p>{content.footerText}</p>
      </div>
      <div className="footer-legal">
        <p>{"\u00a9"} La cocina de Sa {year}</p>
        <p>{"Este sitio es una representaci\u00f3n ilustrativa de productos artesanales."}</p>
        <div className="legal-links">
          <a href="#terminos">{"T\u00e9rminos y condiciones"}</a>
          <a href="#privacidad">{"Pol\u00edtica de privacidad"}</a>
          <a href="#aviso-legal">Aviso legal</a>
        </div>
      </div>
      <div className="footer-icons">
        <SocialIcon href={buildSocialLink("whatsapp", brandSettings.whatsapp)} src="/images/whatsapp.png" label="WhatsApp" />
        <SocialIcon href={buildSocialLink("instagram", brandSettings.instagram)} src="/images/instagram.png" label="Instagram" />
        <SocialIcon href={buildSocialLink("tiktok", brandSettings.tiktok)} src="/images/tiktok.png" label="TikTok" />
      </div>
    </footer>
  );
}

function Credits() {
  return (
    <div className="credits">
      <a href="https://consultorahunters.com/" target="_blank" rel="noreferrer">
        Hecho por Consultora Hunters
      </a>
    </div>
  );
}

function SocialIcon({ href, src, label }) {
  const [failed, setFailed] = useState(false);
  return (
    <a href={href} target="_blank" rel="noreferrer" aria-label={label}>
      {failed ? <span>{label.slice(0, 2)}</span> : <img src={src} alt="" onError={() => setFailed(true)} />}
    </a>
  );
}

function HiddenAdmin({ isLogged, setIsLogged, navigate, products, productStatus, onSaveProduct, onDeleteProduct, onToggleFavorite, recipes, setRecipes, siteContent, setSiteContent, brandSettings, setBrandSettings }) {
  if (!isLogged) {
    return <AdminLogin setIsLogged={setIsLogged} />;
  }

  return (
    <main className="admin-layout">
      <aside>
        <Logo />
        <h1>Panel interno</h1>
        <a href="#admin-products">Productos</a>
        <a href="#admin-recipes">Recetas</a>
        <a href="#admin-content">Contenido</a>
        <a href="#admin-socials">Configuracion / Redes</a>
        <button onClick={() => navigate("/")}>Volver al sitio</button>
        <button onClick={() => { localStorage.removeItem(ADMIN_KEY); setIsLogged(false); }}>Salir</button>
      </aside>
      <section>
        <AdminEditor
          products={products}
          productStatus={productStatus}
          onSaveProduct={onSaveProduct}
          onDeleteProduct={onDeleteProduct}
          onToggleFavorite={onToggleFavorite}
          recipes={recipes}
          setRecipes={setRecipes}
          siteContent={siteContent}
          setSiteContent={setSiteContent}
          brandSettings={brandSettings}
          setBrandSettings={setBrandSettings}
        />
      </section>
    </main>
  );
}

function AdminLogin({ setIsLogged }) {
  const [form, setForm] = useState({ user: "", password: "" });
  const [error, setError] = useState("");

  function submit(event) {
    event.preventDefault();
    if (form.user === ADMIN_USER && form.password === ADMIN_PASSWORD) {
      localStorage.setItem(ADMIN_KEY, "true");
      setIsLogged(true);
      return;
    }
    setError("Usuario o contrase\u00f1a incorrectos.");
  }

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={submit}>
        <Logo />
        <h1>Acceso interno</h1>
        <label>Usuario<input value={form.user} onChange={(e) => setForm({ ...form, user: e.target.value })} required /></label>
        <label>{"Contrase\u00f1a"}<input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} type="password" required /></label>
        {error && <p className="error">{error}</p>}
        <button className="primary" type="submit">Ingresar</button>
      </form>
    </main>
  );
}

function AdminEditor({ products, productStatus, onSaveProduct, onDeleteProduct, onToggleFavorite, recipes, setRecipes, siteContent, setSiteContent, brandSettings, setBrandSettings }) {
  const emptyProduct = { name: "", price: "", description: "", category: "Tortas", customCategory: "", image_url: "", favorite: false };
  const emptyRecipe = { title: "", content: "", ingredients: "", steps: "", image_url: "" };
  const [productForm, setProductForm] = useState(emptyProduct);
  const [recipeForm, setRecipeForm] = useState(emptyRecipe);
  const [editingProductId, setEditingProductId] = useState("");
  const [editingRecipeId, setEditingRecipeId] = useState("");
  const [productFormError, setProductFormError] = useState("");

  async function saveProduct(event) {
    event.preventDefault();
    if (!productForm.name || !productForm.price || !productForm.image_url) {
      setProductFormError("Completa nombre, precio y sube una imagen antes de guardar.");
      return;
    }
    setProductFormError("");
    const category = normalizeCategory(productForm.customCategory || productForm.category);
    const payload = {
      name: productForm.name,
      price: Number(productForm.price || 0),
      description: productForm.description,
      image_url: productForm.image_url,
      category,
      favorite: Boolean(productForm.favorite)
    };
    const saved = await onSaveProduct(payload, editingProductId);
    if (saved) {
      setEditingProductId("");
      setProductForm(emptyProduct);
      setProductFormError("");
    }
  }

  function editProduct(product) {
    const category = normalizeCategory(product.category);
    const isPredefined = predefinedCategories.includes(category);
    setEditingProductId(product.id);
    setProductForm({
      ...product,
      price: String(product.price || ""),
      category: isPredefined ? category : "Otros",
      customCategory: isPredefined ? "" : category
    });
  }

  function deleteProduct(id) {
    if (window.confirm("Eliminar producto?")) {
      onDeleteProduct(id);
    }
  }

  function toggleFavorite(id) {
    onToggleFavorite(id);
  }

  function saveRecipe(event) {
    event.preventDefault();
    const payload = {
      ...recipeForm,
      id: editingRecipeId || crypto.randomUUID(),
      ingredients: normalizeLines(recipeForm.ingredients),
      steps: normalizeLines(recipeForm.steps)
    };
    setRecipes(editingRecipeId
      ? recipes.map((recipe) => recipe.id === editingRecipeId ? payload : recipe)
      : [payload, ...recipes]);
    setEditingRecipeId("");
    setRecipeForm(emptyRecipe);
  }

  function editRecipe(recipe) {
    setEditingRecipeId(recipe.id);
    setRecipeForm({
      ...recipe,
      ingredients: normalizeLines(recipe.ingredients).join("\n"),
      steps: normalizeLines(recipe.steps).join("\n")
    });
  }

  function deleteRecipe(id) {
    if (window.confirm("Eliminar receta?")) {
      setRecipes(recipes.filter((recipe) => recipe.id !== id));
    }
  }

  return (
    <div className="admin-editor">
      <section id="admin-products" className="admin-card">
        <h2>Productos</h2>
        {productStatus && <p className="admin-help">{productStatus}</p>}
        <form onSubmit={saveProduct}>
          <label>Nombre<input value={productForm.name} onChange={(e) => setProductForm({ ...productForm, name: e.target.value })} required /></label>
          <label>Precio<input value={productForm.price} onChange={(e) => setProductForm({ ...productForm, price: e.target.value })} type="number" required /></label>
          <label>Descripcion<textarea value={productForm.description} onChange={(e) => setProductForm({ ...productForm, description: e.target.value })} required /></label>
          <div className="category-admin-grid">
            <label>
              Categoria
              <select value={productForm.category} onChange={(e) => setProductForm({ ...productForm, category: e.target.value })}>
                {predefinedCategories.map((category) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </label>
            <label>
              Categoria personalizada
              <input
                value={productForm.customCategory}
                onChange={(e) => setProductForm({ ...productForm, customCategory: e.target.value })}
                placeholder="Opcional"
              />
            </label>
          </div>
          <ImageInput label="Imagen" value={productForm.image_url} onChange={(image_url) => setProductForm({ ...productForm, image_url })} />
          <label className="check-line"><input type="checkbox" checked={productForm.favorite} onChange={(e) => setProductForm({ ...productForm, favorite: e.target.checked })} /> Marcar como favorito</label>
          {productFormError && <p className="error">{productFormError}</p>}
          <button className="primary" type="submit">{editingProductId ? "Guardar producto" : "Crear producto"}</button>
        </form>
        <AdminList
          items={products}
          type="product"
          onEdit={editProduct}
          onDelete={deleteProduct}
          onFavorite={toggleFavorite}
        />
      </section>

      <section id="admin-recipes" className="admin-card">
        <h2>Recetas</h2>
        <form onSubmit={saveRecipe}>
          <label>Titulo<input value={recipeForm.title} onChange={(e) => setRecipeForm({ ...recipeForm, title: e.target.value })} required /></label>
          <label>Contenido<textarea value={recipeForm.content} onChange={(e) => setRecipeForm({ ...recipeForm, content: e.target.value })} required /></label>
          <label>Ingredientes<textarea value={recipeForm.ingredients} onChange={(e) => setRecipeForm({ ...recipeForm, ingredients: e.target.value })} placeholder="Uno por linea" required /></label>
          <label>Paso a paso<textarea value={recipeForm.steps} onChange={(e) => setRecipeForm({ ...recipeForm, steps: e.target.value })} placeholder="Uno por linea" required /></label>
          <ImageInput label="Imagen" value={recipeForm.image_url} onChange={(image_url) => setRecipeForm({ ...recipeForm, image_url })} />
          <button className="primary" type="submit">{editingRecipeId ? "Guardar receta" : "Crear receta"}</button>
        </form>
        <AdminList items={recipes} type="recipe" onEdit={editRecipe} onDelete={deleteRecipe} />
      </section>

      <section id="admin-content" className="admin-card content-card">
        <h2>Contenido de la web</h2>
        <div className="content-grid">
          {Object.entries(siteContent).map(([key, value]) => (
            <label key={key}>
              {contentLabel(key)}
              <textarea value={value} onChange={(e) => setSiteContent({ ...siteContent, [key]: e.target.value })} rows={key.toLowerCase().includes("text") ? 4 : 2} />
            </label>
          ))}
        </div>
      </section>

      <section id="admin-socials" className="admin-card content-card">
        <h2>Configuracion / Redes</h2>
        <p className="admin-help">Estos datos alimentan todos los botones sociales del sitio y el mensaje de pedido por WhatsApp.</p>
        <div className="content-grid">
          <label>
            WhatsApp
            <input
              value={brandSettings.whatsapp}
              onChange={(e) => setBrandSettings({ ...brandSettings, whatsapp: e.target.value })}
              placeholder="1123929030"
            />
          </label>
          <label>
            Instagram
            <input
              value={brandSettings.instagram}
              onChange={(e) => setBrandSettings({ ...brandSettings, instagram: e.target.value })}
              placeholder="https://instagram.com/lacocinadesa o @lacocinadesa"
            />
          </label>
          <label>
            TikTok
            <input
              value={brandSettings.tiktok}
              onChange={(e) => setBrandSettings({ ...brandSettings, tiktok: e.target.value })}
              placeholder="https://tiktok.com/@lacocinadesa o @lacocinadesa"
            />
          </label>
        </div>
      </section>
    </div>
  );
}

function ImageInput({ label, value, onChange }) {
  const [preview, setPreview] = useState(value);
  const [status, setStatus] = useState("");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    setPreview(value);
  }, [value]);

  async function handleFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setPreview(URL.createObjectURL(file));
    setUploading(true);
    setStatus("Subiendo imagen...");

    try {
      const publicUrl = await uploadImageToStorage(file);
      onChange(publicUrl);
      setPreview(publicUrl);
      setStatus("Imagen subida correctamente.");
    } catch (error) {
      setStatus(error.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="image-input">
      <label>{label} URL<input value={value} onChange={(e) => onChange(e.target.value)} readOnly placeholder="Se genera automaticamente al subir la imagen" /></label>
      <label className="upload-box">
        {uploading ? "Subiendo..." : "Subir imagen"}
        <input type="file" accept="image/*" onChange={handleFile} />
      </label>
      {!isStorageConfigured && <p className="upload-note">Configura Supabase Storage para subir imagenes reales.</p>}
      {status && <p className={status.includes("correctamente") ? "upload-success" : "upload-note"}>{status}</p>}
      {preview && <img className="image-preview" src={preview} alt="Previsualizacion" />}
    </div>
  );
}

function AdminList({ items, type, onEdit, onDelete, onFavorite }) {
  return (
    <div className="admin-list">
      {items.map((item) => (
        <article key={item.id}>
          <img src={item.image_url} alt={item.name || item.title} />
          <div>
            <strong>{item.name || item.title}</strong>
            <p>{item.description || item.content}</p>
          </div>
          {type === "product" && <button onClick={() => onFavorite(item.id)}>{item.favorite ? "\u2605" : "\u2606"}</button>}
          <button onClick={() => onEdit(item)}>Editar</button>
          <button onClick={() => onDelete(item.id)}>Eliminar</button>
        </article>
      ))}
    </div>
  );
}

function SectionTitle({ eyebrow, title }) {
  return (
    <div className="section-title">
      <p className="eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
    </div>
  );
}

function mapSupabaseProduct(product) {
  return {
    id: product.id,
    name: product.name || "",
    price: Number(product.price || 0),
    description: product.description || "",
    image_url: product.image || product.image_url || "",
    category: normalizeCategory(product.category),
    favorite: Boolean(product.favorite)
  };
}

function productToSupabase(product, includeFavorite = true) {
  const payload = {
    name: product.name,
    price: Number(product.price || 0),
    description: product.description,
    image: product.image_url,
    category: normalizeCategory(product.category)
  };

  if (includeFavorite) {
    payload.favorite = Boolean(product.favorite);
  }

  return payload;
}

function buildWhatsAppLink(cart, whatsapp) {
  const total = getCartTotal(cart);
  const lines = cart.length
    ? cart.map((item) => `- ${item.name} x${item.quantity}: ${formatPrice(item.price * item.quantity)}`)
    : ["Hola Sa, quiero realizar un pedido."];
  const message = cart.length
    ? `Hola Sa! Quiero realizar este pedido:\n${lines.join("\n")}\nTotal: ${formatPrice(total)}`
    : lines[0];
  return `${buildSocialLink("whatsapp", whatsapp)}?text=${encodeURIComponent(message)}`;
}

function buildSocialLink(type, value) {
  const rawValue = String(value || "").trim();
  if (type === "whatsapp") {
    const number = rawValue.replace(/[^\d]/g, "") || brand.whatsapp;
    return `https://wa.me/${number}`;
  }
  if (/^https?:\/\//i.test(rawValue)) {
    return rawValue;
  }
  const username = rawValue.replace(/^@/, "");
  if (type === "instagram") {
    return `https://instagram.com/${username || "lacocinadesa"}`;
  }
  if (type === "tiktok") {
    return `https://tiktok.com/@${username || "lacocinadesa"}`;
  }
  return rawValue || "#";
}

function getCartTotal(cart) {
  return cart.reduce((sum, item) => sum + Number(item.price || 0) * item.quantity, 0);
}

function formatPrice(price) {
  if (!price) return "$0";
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(price);
}

function normalizeLines(value, fallback = []) {
  const lines = Array.isArray(value)
    ? value.filter(Boolean)
    : String(value || "").split("\n").map((line) => line.trim()).filter(Boolean);
  return lines.length ? lines : fallback;
}

function normalizeProducts(products) {
  return products.map((product) => ({
    ...product,
    category: normalizeCategory(product.category),
    favorite: Boolean(product.favorite)
  }));
}

function normalizeCategory(value) {
  const category = String(value || "Otros").trim();
  if (!category) return "Otros";
  return category.charAt(0).toUpperCase() + category.slice(1).toLowerCase();
}

function getProductCategories(products) {
  const detected = products.map((product) => normalizeCategory(product.category));
  return [...new Set(detected)].sort((first, second) => first.localeCompare(second, "es"));
}

function categoryToSlug(category) {
  return normalizeCategory(category)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getCategoryFromPath(path) {
  const segment = String(path || "/").split("/").filter(Boolean)[0];
  if (!segment || segment === "admin") return "";
  return normalizeCategory(decodeURIComponent(segment).replace(/-/g, " "));
}

function normalizeRecipes(recipes) {
  const defaultsById = new Map(defaultRecipes.map((recipe) => [recipe.id, recipe]));
  return recipes.map((recipe) => {
    const fallback = defaultsById.get(recipe.id) || {};
    return {
      ...recipe,
      ingredients: normalizeLines(recipe.ingredients, fallback.ingredients || []),
      steps: normalizeLines(recipe.steps, fallback.steps || [])
    };
  });
}

function loadStored(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return Array.isArray(value) && value.length ? value : fallback;
  } catch {
    return fallback;
  }
}

function loadStoredObject(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) || {};
  } catch {
    return {};
  }
}

function contentLabel(key) {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());
}

export default App;
