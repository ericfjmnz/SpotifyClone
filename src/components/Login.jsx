
function Login(props){
    let parsed = queryString.parse(window.location.search)
    console.log(parsed.access_token)
    if(props.authorized === false){
        return(
            <div>
                <LoginMenu/>
            </div>
        )}else{
            return(
                <div>
                    <LogoutMenu/>
                </div>
            )
        }
    }

const mapStateToProps = (state) => {
    return{
        authorized: state.isAuthorized
    }
}

const mapDispatchToProps = (dispatch) => {
    return{
        onUsername:() => dispatch({
            type: 'USERNAME'
        }),
        offUsername:() => Dispatch({
            TYPE: 'NoUSERNAME'
        })
    }
}

// export default Connect(mapStateToProps, mapDispatchToProps)(Login)