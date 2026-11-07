/*
 * DOCUMENTACIÓN - range.js (slider doble de precio de los filtros)
 *
 * Controla el bloque ".range-slider" de las páginas de excursiones: dos barras (mínimo y máximo)
 * y dos casillas numéricas que se mantienen sincronizadas. Si se mueve una barra, se actualiza
 * la casilla y al revés. Si el mínimo supera al máximo, se intercambian.
 *
 * Los límites (min, max, step) se cambian en el HTML, en los input type="range" y "number".
 * Hoy es solo visual: los valores no se envían a ningún lado hasta que haya backend.
 */
(function() {

  // Si la página no tiene el slider, el script termina sin hacer nada.
  var parent = document.querySelector(".range-slider");
  if(!parent) return;

  var
    rangeS = parent.querySelectorAll("input[type=range]"),
    numberS = parent.querySelectorAll("input[type=number]");

  // Al mover una barra: actualiza las dos casillas, ordenando mínimo y máximo.
  rangeS.forEach(function(el) {
    el.oninput = function() {
      var slide1 = parseFloat(rangeS[0].value),
        	slide2 = parseFloat(rangeS[1].value);

      if (slide1 > slide2) {
				[slide1, slide2] = [slide2, slide1];
        // var tmp = slide2;
        // slide2 = slide1;
        // slide1 = tmp;
      }

      numberS[0].value = slide1;
      numberS[1].value = slide2;
    }
  });

  // Al escribir en una casilla: actualiza las dos barras, ordenando mínimo y máximo.
  numberS.forEach(function(el) {
    el.oninput = function() {
			var number1 = parseFloat(numberS[0].value),
					number2 = parseFloat(numberS[1].value);
			
      if (number1 > number2) {
        var tmp = number1;
        numberS[0].value = number2;
        numberS[1].value = tmp;
      }

      rangeS[0].value = number1;
      rangeS[1].value = number2;

    }
  });

})();