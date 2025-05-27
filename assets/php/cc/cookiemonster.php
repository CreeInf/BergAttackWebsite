<?php
$withsamesite = isset( $_POST['samesite'] ) ? $_POST['samesite'] : false;
// convert to bool since post var is string  in case it isn't
$withsamesite = $withsamesite === 'true' ? true : false;
$cookiename = $_POST['cookiename'];
$cookievalue = urldecode($_POST['cookievalue']);
$encodedvalue = json_encode( $cookievalue );

$expire = time()+60*60*24*60; // 60 days

if ( strpos($cookiename, 'zp_consent') === 0 ){
	// header("Set-Cookie: {$cookiename}={$cookievalue}; Max-Age={$expire}; Path=/");
	if ( $withsamesite ){
		setcookie($cookiename, $cookievalue, ['expires' => $expire, 'path' => '/', 'secure' => true, 'samesite' => 'None']);
	}
	else{
		setcookie($cookiename, $cookievalue, $expire, '/');
	}
}
echo '{"success": true}';
?>
