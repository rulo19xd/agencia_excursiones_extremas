/*
 * DOCUMENTACIÓN - google-map.js (mapa de contact.html)
 *
 * Dibuja el mapa de Google dentro del div con id="map" y le agrega un marcador.
 * Se ejecuta solo cuando la ventana terminó de cargar (última línea del archivo).
 *
 * PARA CAMBIAR LA UBICACIÓN:
 *   - myLatlng: latitud y longitud donde se centra el mapa (hoy: Nueva York, de la plantilla).
 *   - addresses: lista de direcciones donde se ponen marcadores (hoy ['New York']).
 *   - zoom: nivel de acercamiento (1 = mundo, 15 = calles).
 * PARA QUE FUNCIONE EN PRODUCCIÓN:
 *   - La clave de la API está en el <script src="https://maps.googleapis.com/...key=..."> de contact.html;
 *     hay que reemplazarla por una clave propia de Google Cloud.
 *   - La búsqueda de la dirección (geocoding) usa http y el parámetro "sensor", que Google ya no
 *     soporta bien: si el marcador no aparece, reemplazar por https y/o usar las coordenadas
 *     directamente con new google.maps.Marker({ position: myLatlng, map: map }).
 * IMPORTANTE: en las páginas sin mapa este archivo da un error en consola (no rompe nada visible).
 */

// Variable global de Google Maps (la crea el script de la API).
var google;

// init(): arma el mapa y los marcadores.
function init() {
    // Basic options for a simple Google Map
    // For more options see: https://developers.google.com/maps/documentation/javascript/reference#MapOptions
    // var myLatlng = new google.maps.LatLng(40.71751, -73.990922);
    // Coordenadas del centro del mapa (latitud, longitud). CAMBIAR por las del negocio.
    var myLatlng = new google.maps.LatLng(40.69847032728747, -73.9514422416687);
    // 39.399872
    // -8.224454
    
    // Opciones del mapa. scrollwheel: false = la ruedita del mouse no hace zoom (evita trabarse al scrollear la página).
    // styles: colores/visibilidad de elementos del mapa.
    var mapOptions = {
        // How zoomed in you want the map to start at (always required)
        zoom: 7,

        // The latitude and longitude to center the map (always required)
        center: myLatlng,

        // How you would like to style the map. 
        scrollwheel: false,
        styles: [
            {
                "featureType": "administrative.country",
                "elementType": "geometry",
                "stylers": [
                    {
                        "visibility": "simplified"
                    },
                    {
                        "hue": "#ff0000"
                    }
                ]
            }
        ]
    };

    

    // Get the HTML DOM element that will contain your map 
    // We are using a div with id="map" seen below in the <body>
    // Contenedor del mapa: el div id="map" de contact.html.
    var mapElement = document.getElementById('map');

    // Create the Google Map using out element and options defined above
    var map = new google.maps.Map(mapElement, mapOptions);
    
    // Direcciones donde se dibuja el marcador (ícono images/loc.png). Agregar más textos para más marcadores.
    var addresses = ['New York'];

    for (var x = 0; x < addresses.length; x++) {
        $.getJSON('http://maps.googleapis.com/maps/api/geocode/json?address='+addresses[x]+'&sensor=false', null, function (data) {
            var p = data.results[0].geometry.location
            var latlng = new google.maps.LatLng(p.lat, p.lng);
            new google.maps.Marker({
                position: latlng,
                map: map,
                icon: 'images/loc.png'
            });

        });
    }
    
}
google.maps.event.addDomListener(window, 'load', init);