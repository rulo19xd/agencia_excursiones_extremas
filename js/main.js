/*
 * DOCUMENTACIÓN - main.js (script principal de la plantilla)
 *
 * Se carga al final de todas las páginas. Inicializa los plugins (jQuery) que
 * dan vida a la plantilla. Cada bloque es independiente: si algo no existe en
 * la página (por ejemplo no hay carrusel), simplemente no hace nada.
 *
 * ÍNDICE
 *   AOS.init            animaciones al hacer scroll (librería aos.js)
 *   stellar             efecto parallax del fondo
 *   fullHeight()        hace que el hero (.js-fullheight) ocupe toda la pantalla
 *   loader()            oculta el círculo de carga
 *   carousel()          carruseles (destacadas, testimonios, galería de hotel)
 *   scrollWindow()      cambia el estilo del navbar al bajar la página
 *   counter()           anima los números de "Nuestra Experiencia"
 *   contentWayPoint()   animación de entrada de los bloques .ftco-animate
 *   OnePageNav()        scroll suave para enlaces que empiezan con #
 *   magnificPopup       ventanas emergentes de imagen y video
 *   datepicker          calendario de los campos #checkin_date y #checkout_date
 *
 * COSAS PARA RECORDAR AL TOCAR ESTE ARCHIVO
 *   - Formato de fecha del calendario: está en 'm/d/yyyy' (mes/día/año, EEUU).
 *     Para Argentina cambiar a 'd/m/yyyy' (ver la línea del datepicker abajo).
 *   - Hay console.log() de la plantilla original (solo para pruebas); se pueden borrar.
 *   - Este archivo NO maneja el carrito ni el pago: eso está en carrito.js y checkout.js.
 */
 // AOS: animación de aparición al hacer scroll. duration = duración en ms; easing = tipo de movimiento.
 AOS.init({
 	duration: 800,
 	easing: 'slide'
 });

(function($) {

	"use strict";

	// isMobile: detecta si el navegador es de un celular (Android, iPhone, etc.).
	// La plantilla lo trae pero hoy NO se usa; sirve si se quiere un comportamiento distinto en móviles.
	var isMobile = {
		Android: function() {
			return navigator.userAgent.match(/Android/i);
		},
			BlackBerry: function() {
			return navigator.userAgent.match(/BlackBerry/i);
		},
			iOS: function() {
			return navigator.userAgent.match(/iPhone|iPad|iPod/i);
		},
			Opera: function() {
			return navigator.userAgent.match(/Opera Mini/i);
		},
			Windows: function() {
			return navigator.userAgent.match(/IEMobile/i);
		},
			any: function() {
			return (isMobile.Android() || isMobile.BlackBerry() || isMobile.iOS() || isMobile.Opera() || isMobile.Windows());
		}
	};


	// Parallax (plugin stellar): el fondo se mueve más lento que el contenido al hacer scroll.
	// responsive: se adapta al tamaño de pantalla. horizontalScrolling: false = solo movimiento vertical.
	$(window).stellar({
    responsive: true,
    parallaxBackgrounds: true,
    parallaxElements: true,
    horizontalScrolling: false,
    hideDistantElements: false,
    scrollProperty: 'scroll'
  });


	// Pone a todo elemento con clase "js-fullheight" (el hero/portada) la altura de la ventana,
	// y lo recalcula si se cambia el tamaño. Para una portada más baja, quitar esa clase en el HTML.
	var fullHeight = function() {

		$('.js-fullheight').css('height', $(window).height());
		$(window).resize(function(){
			$('.js-fullheight').css('height', $(window).height());
		});

	};
	fullHeight();

	// Pantalla de carga: quita la clase "show" del div #ftco-loader para que desaparezca.
	// loader
	var loader = function() {
		setTimeout(function() { 
			if($('#ftco-loader').length > 0) {
				$('#ftco-loader').removeClass('show');
			}
		}, 1);
	};
	loader();

	// Scrollax: efecto de desplazamiento en el texto del hero (atributos data-scrollax del HTML).
	// Scrollax
   $.Scrollax();

	// CARRUSELES (plugin Owl Carousel). Los tres se activan por el nombre de clase del contenedor.
	// Opciones comunes: autoplay = pasa solo; loop = vuelve al inicio; items = cuántos se ven;
	// margin = separación en px; nav = flechas; dots = puntitos; responsive = cuántos items según el ancho.
	var carousel = function() {
		// Carrusel de "Nuestras aventuras destacadas" (index.html). 1 item en celular, 2 desde 600px, 4 desde 1000px.
		$('.destination-slider').owlCarousel({
			autoplay: true,
			loop: true,
			items:1,
			margin: 30,
			stagePadding: 0,
			nav: true,
			dots: true,
			navText: ['<span class="ion-ios-arrow-back">', '<span class="ion-ios-arrow-forward">'],
			responsive:{
				0:{
					items: 1
				},
				600:{
					items: 2
				},
				1000:{
					items: 4
				}
			}
		});
		// Carrusel de testimonios de clientes (index.html). Siempre muestra 1 a la vez.
		$('.carousel-testimony').owlCarousel({
			autoplay: true,
			loop: true,
			items:1,
			margin: 0,
			stagePadding: 0,
			nav: true,
			navText: ['<span class="ion-ios-arrow-back">', '<span class="ion-ios-arrow-forward">'],
			responsive:{
				0:{
					items: 1
				},
				600:{
					items: 1
				},
				1000:{
					items: 1
				}
			}
		});

		// Galería de fotos del alojamiento (hotel-single.html). Pasa con efecto de desvanecimiento (fadeIn/fadeOut).
		$('.single-slider').owlCarousel({
			animateOut: 'fadeOut',
	    animateIn: 'fadeIn',
			autoplay: true,
			loop: true,
			items:1,
			margin: 0,
			stagePadding: 0,
			nav: true,
			dots: true,
			navText: ['<span class="ion-ios-arrow-back">', '<span class="ion-ios-arrow-forward">'],
			responsive:{
				0:{
					items: 1
				},
				600:{
					items: 1
				},
				1000:{
					items: 1
				}
			}
		});

	};
	carousel();

	// Abre los submenús del navbar al pasar el mouse (clase .dropdown). Hoy el menú no tiene submenús, así que no actúa.
	$('nav .dropdown').hover(function(){
		var $this = $(this);
		// 	 timer;
		// clearTimeout(timer);
		$this.addClass('show');
		$this.find('> a').attr('aria-expanded', true);
		// $this.find('.dropdown-menu').addClass('animated-fast fadeInUp show');
		$this.find('.dropdown-menu').addClass('show');
	}, function(){
		var $this = $(this);
			// timer;
		// timer = setTimeout(function(){
			$this.removeClass('show');
			$this.find('> a').attr('aria-expanded', false);
			// $this.find('.dropdown-menu').removeClass('animated-fast fadeInUp show');
			$this.find('.dropdown-menu').removeClass('show');
		// }, 100);
	});


	// Evento de prueba de la plantilla (escribe en la consola). No tiene efecto visible.
	$('#dropdown04').on('show.bs.dropdown', function () {
	  console.log('show');
	});

	// Comportamiento del navbar según el scroll:
	//   más de 150px -> agrega la clase "scrolled" (barra fija y con fondo)
	//   más de 350px -> agrega "awake" (la barra aparece con animación)
	//   vuelve arriba -> las quita. Los estilos de esas clases están en css/style.css (buscar ".ftco_navbar").
	// scroll
	var scrollWindow = function() {
		$(window).scroll(function(){
			var $w = $(this),
					st = $w.scrollTop(),
					navbar = $('.ftco_navbar'),
					sd = $('.js-scroll-wrap');

			if (st > 150) {
				if ( !navbar.hasClass('scrolled') ) {
					navbar.addClass('scrolled');	
				}
			} 
			if (st < 150) {
				if ( navbar.hasClass('scrolled') ) {
					navbar.removeClass('scrolled sleep');
				}
			} 
			if ( st > 350 ) {
				if ( !navbar.hasClass('awake') ) {
					navbar.addClass('awake');	
				}
				
				if(sd.length > 0) {
					sd.addClass('sleep');
				}
			}
			if ( st < 350 ) {
				if ( navbar.hasClass('awake') ) {
					navbar.removeClass('awake');
					navbar.addClass('sleep');
				}
				if(sd.length > 0) {
					sd.removeClass('sleep');
				}
			}
		});
	};
	scrollWindow();

	var isMobile = {
		Android: function() {
			return navigator.userAgent.match(/Android/i);
		},
			BlackBerry: function() {
			return navigator.userAgent.match(/BlackBerry/i);
		},
			iOS: function() {
			return navigator.userAgent.match(/iPhone|iPad|iPod/i);
		},
			Opera: function() {
			return navigator.userAgent.match(/Opera Mini/i);
		},
			Windows: function() {
			return navigator.userAgent.match(/IEMobile/i);
		},
			any: function() {
			return (isMobile.Android() || isMobile.BlackBerry() || isMobile.iOS() || isMobile.Opera() || isMobile.Windows());
		}
	};

	
	// Contadores animados: cuando la sección #section-counter entra en pantalla (waypoint, al 95%),
	// cada elemento ".number" cuenta desde 0 hasta su data-number en 7000 ms (7 segundos).
	// Para cambiar la velocidad: modificar 7000. El separador de miles es la coma (separator(',')).
	var counter = function() {
		
		$('#section-counter').waypoint( function( direction ) {

			if( direction === 'down' && !$(this.element).hasClass('ftco-animated') ) {

				var comma_separator_number_step = $.animateNumber.numberStepFactories.separator(',')
				$('.number').each(function(){
					var $this = $(this),
						num = $this.data('number');
						console.log(num);
					$this.animateNumber(
					  {
					    number: num,
					    numberStep: comma_separator_number_step
					  }, 7000
					);
				});
				
			}

		} , { offset: '95%' } );

	}
	counter();

	// Animación de entrada: cada bloque con clase "ftco-animate" aparece (fadeInUp por defecto)
	// cuando se llega a él con el scroll. Se puede cambiar por bloque con data-animate-effect="fadeIn|fadeInLeft|fadeInRight".
	// La clase "ftco-animated" marca los que ya se animaron para no repetir.
	var contentWayPoint = function() {
		var i = 0;
		$('.ftco-animate').waypoint( function( direction ) {

			if( direction === 'down' && !$(this.element).hasClass('ftco-animated') ) {
				
				i++;

				$(this.element).addClass('item-animate');
				setTimeout(function(){

					$('body .ftco-animate.item-animate').each(function(k){
						var el = $(this);
						setTimeout( function () {
							var effect = el.data('animate-effect');
							if ( effect === 'fadeIn') {
								el.addClass('fadeIn ftco-animated');
							} else if ( effect === 'fadeInLeft') {
								el.addClass('fadeInLeft ftco-animated');
							} else if ( effect === 'fadeInRight') {
								el.addClass('fadeInRight ftco-animated');
							} else {
								el.addClass('fadeInUp ftco-animated');
							}
							el.removeClass('item-animate');
						},  k * 50, 'easeInOutExpo' );
					});
					
				}, 100);
				
			}

		} , { offset: '95%' } );
	};
	contentWayPoint();


	// Scroll suave: los enlaces que empiezan con # (anclas) bajan con animación de 700 ms.
	// Si el menú está plegado (celular), se cierra solo después de tocar un enlace.
	// navigation
	var OnePageNav = function() {
		$(".smoothscroll[href^='#'], #ftco-nav ul li a[href^='#']").on('click', function(e) {
		 	e.preventDefault();

		 	var hash = this.hash,
		 			navToggler = $('.navbar-toggler');
		 	$('html, body').animate({
		    scrollTop: $(hash).offset().top
		  }, 700, 'easeInOutExpo', function(){
		    window.location.hash = hash;
		  });


		  if ( navToggler.is(':visible') ) {
		  	navToggler.click();
		  }
		});
		// Evento de prueba de la plantilla (escribe "nice" en la consola). Sin efecto visible.
		$('body').on('activate.bs.scrollspy', function () {
		  console.log('nice');
		})
	};
	OnePageNav();


	// Ventana emergente de imágenes (Magnific Popup): se activa en los enlaces con clase "image-popup".
	// Permite galería (flechas) y zoom.
	// magnific popup
	$('.image-popup').magnificPopup({
    type: 'image',
    closeOnContentClick: true,
    closeBtnInside: false,
    fixedContentPos: true,
    mainClass: 'mfp-no-margins mfp-with-zoom', // class to remove default margin from left and right side
     gallery: {
      enabled: true,
      navigateByImgClick: true,
      preload: [0,1] // Will preload 0 - before current, and 1 after the current image
    },
    image: {
      verticalFit: true
    },
    zoom: {
      enabled: true,
      duration: 300 // don't foget to change the duration also in CSS
    }
  });

  // Ventana emergente de video/mapa: enlaces con clase popup-youtube, popup-vimeo o popup-gmaps.
  // disableOn: 700 = en pantallas menores a 700px abre el enlace normal en vez de la ventana.
  $('.popup-youtube, .popup-vimeo, .popup-gmaps').magnificPopup({
    disableOn: 700,
    type: 'iframe',
    mainClass: 'mfp-fade',
    removalDelay: 160,
    preloader: false,

    fixedContentPos: false
  });


  // CALENDARIO de fechas (bootstrap-datepicker) para los inputs con id checkin_date y checkout_date.
  // format: formato mostrado. Está en EEUU (mes/día/año): para Argentina usar 'd/m/yyyy'.
  // autoclose: se cierra al elegir un día.
  // OJO: en tour.html los dos inputs tienen el MISMO id (checkin_date), por eso el segundo no recibe calendario.
  $('#checkin_date, #checkout_date').datepicker({
	  'format': 'm/d/yyyy',
	  'autoclose': true
	});




})(jQuery);

